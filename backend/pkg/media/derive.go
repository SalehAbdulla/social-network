// Package media turns one stored upload into the smaller versions a browser can choose
// between, so that a feed full of phone photos does not download every original.
//
// The unit of work is one *derivative*: the same picture at a capped width. Everything here is
// pure — bytes in, bytes out — which is what makes it worth testing away from HTTP: the encoder,
// the format rules and the "never upscale" decision are the parts that can be wrong in a way a
// status code would not show.
//
// What this package deliberately does not do:
//
//   - It does not decode video. Re-encoding a phone video needs a tool this repository has no
//     business shipping, so a video gets no derivatives and `?size=` falls back to the original.
//   - It does not resize an animated GIF. Decoding one yields its first frame, and a still frame
//     is a different picture rather than a smaller one, so GIFs keep their original.
//   - It does not rotate by EXIF orientation. The stored original is untouched, and a derivative
//     inherits its pixels as decoded, which is the decision the upload path already records.
package media

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"strconv"
	"strings"

	"golang.org/x/image/draw"

	// The formats this package can decode, registered for image.Decode.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

const (
	// ThumbWidth and LargeWidth cap the width of the two derivatives, in pixels. They are caps
	// rather than sizes: an upload no wider than a cap gets no such derivative, because
	// upscaling spends bytes to look worse. The frontend names the same two numbers in
	// `src/app/lib/mediaLimits.ts` for its `srcset` descriptors, and `media_limits_test.go`
	// holds the two files in step.
	ThumbWidth = 480
	LargeWidth = 1600

	// jpegQuality applies to derivatives only. An original is stored exactly as it arrived.
	jpegQuality = 82

	// QueryOriginal is what an empty `?size=` means, and what a caller may also say out loud.
	QueryOriginal = "original"
)

// ErrAlreadyNarrow is what Encode reports when the image is no wider than the requested cap, so
// there is nothing to write. Callers treat it as "no derivative", not as a failure.
var ErrAlreadyNarrow = errors.New("media: the image is already no wider than this variant")

// Variant is one derivative: the suffix of its file name and the width it caps.
type Variant struct {
	Name  string
	Width int
}

// Variants is every derivative this package produces, narrowest first.
func Variants() []Variant {
	return []Variant{{Name: "thumb", Width: ThumbWidth}, {Name: "large", Width: LargeWidth}}
}

// Lookup returns the variant with that name, which is what a query string is resolved against.
func Lookup(name string) (Variant, bool) {
	for _, variant := range Variants() {
		if variant.Name == name {
			return variant, true
		}
	}
	return Variant{}, false
}

// FileName is where a derivative lives in the upload directory: the upload's own id plus the
// variant's name. An id is a UUID and a name is one of the two above, so the result cannot leave
// the directory the original is in.
func FileName(id string, variant Variant) string {
	return id + "_" + variant.Name
}

// String is what a log line prints, so a reader sees the cap without knowing the variants.
func (v Variant) String() string { return v.Name + "(" + strconv.Itoa(v.Width) + "px)" }

// ParseFileName is FileName in reverse: it reports whether a name in the upload directory is a
// derivative, and of which upload. The collector uses it to sweep a derivative whose row is
// gone, which it otherwise would not recognise — a `_thumb` name does not parse as a UUID, so it
// would look like a file an operator had put there by hand and be left alone forever.
func ParseFileName(name string) (string, Variant, bool) {
	cut := strings.LastIndex(name, "_")
	if cut <= 0 {
		return "", Variant{}, false
	}
	variant, known := Lookup(name[cut+1:])
	if !known {
		return "", Variant{}, false
	}
	return name[:cut], variant, true
}

// Plan reports which derivatives are worth writing for one upload, given the type the upload path
// sniffed and the width it read out of the image header. A type that cannot be decoded here gets
// none, and so does an image already narrower than every cap.
func Plan(contentType string, width int) []Variant {
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
	default:
		// GIF keeps its animation, and video cannot be decoded here; both are served whole.
		return nil
	}
	var planned []Variant
	for _, variant := range Variants() {
		if width > variant.Width {
			planned = append(planned, variant)
		}
	}
	return planned
}

// OutputType is the type a derivative is encoded as: JPEG stays JPEG and everything else becomes
// PNG, so that an alpha channel survives the trip. That is a deliberate cost — a photographic PNG
// or WebP derivative is much larger than a JPEG one would be — taken because flattening
// transparency is a visible defect and a bigger file is not.
func OutputType(contentType string) string {
	if contentType == "image/jpeg" {
		return "image/jpeg"
	}
	return "image/png"
}

// ParseSize resolves one `?size=` value: an empty string or "original" means the original, a
// variant name means that variant, and anything else is refused rather than quietly serving the
// original, because a typo should not cost a full-size download without saying so. The second
// result says whether the value was understood; the first is only meaningful when it was.
func ParseSize(value string) (Variant, bool) {
	if value == "" || value == QueryOriginal {
		return Variant{}, true
	}
	return Lookup(value)
}

// Encode decodes one image and returns it re-encoded at the variant's width, with the type it was
// encoded as. An image already that narrow, or one whose bytes do not decode — an animated WebP is
// the realistic case, since only the static ones have a decoder here — is reported rather than
// guessed at, and the caller keeps the original.
func Encode(source []byte, contentType string, variant Variant) ([]byte, string, error) {
	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return nil, "", err
	}
	bounds := decoded.Bounds()
	if bounds.Dx() <= variant.Width {
		return nil, "", ErrAlreadyNarrow
	}
	height := bounds.Dy() * variant.Width / bounds.Dx()
	if height < 1 {
		height = 1
	}
	target := image.NewRGBA(image.Rect(0, 0, variant.Width, height))
	// CatmullRom is the slow, good one. A derivative is written once and served many times, and
	// the cheaper ApproxBiLinear leaves visible softness on the downscaled thumbnails the feed
	// leans on, so the milliseconds are worth it here.
	draw.CatmullRom.Scale(target, target.Bounds(), decoded, bounds, draw.Over, nil)

	var encoded bytes.Buffer
	outputType := OutputType(contentType)
	if outputType == "image/jpeg" {
		err = jpeg.Encode(&encoded, target, &jpeg.Options{Quality: jpegQuality})
	} else {
		err = png.Encode(&encoded, target)
	}
	if err != nil {
		return nil, "", err
	}
	return encoded.Bytes(), outputType, nil
}
