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

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

const (
	ThumbWidth = 480
	LargeWidth = 1600

	jpegQuality = 82

	QueryOriginal = "original"
)

var ErrAlreadyNarrow = errors.New("media: the image is already no wider than this variant")

type Variant struct {
	Name  string
	Width int
}

func Variants() []Variant {
	return []Variant{{Name: "thumb", Width: ThumbWidth}, {Name: "large", Width: LargeWidth}}
}

func Lookup(name string) (Variant, bool) {
	for _, variant := range Variants() {
		if variant.Name == name {
			return variant, true
		}
	}
	return Variant{}, false
}

func FileName(id string, variant Variant) string {
	return id + "_" + variant.Name
}

func (v Variant) String() string { return v.Name + "(" + strconv.Itoa(v.Width) + "px)" }

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

func Plan(contentType string, width int) []Variant {
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
	default:
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

func OutputType(contentType string) string {
	if contentType == "image/jpeg" {
		return "image/jpeg"
	}
	return "image/png"
}

func ParseSize(value string) (Variant, bool) {
	if value == "" || value == QueryOriginal {
		return Variant{}, true
	}
	return Lookup(value)
}

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
