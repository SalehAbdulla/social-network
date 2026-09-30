package media

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"testing"
)

// photo builds a JPEG of the given size with enough variation that re-encoding it is a real
// encode rather than a run of identical pixels.
func photo(t *testing.T, width, height int) []byte {
	t.Helper()
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: uint8((x + y) % 256), A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, canvas, &jpeg.Options{Quality: 92}); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

// transparentPNG builds a PNG whose left half is see-through, which is what the format choice in
// OutputType exists to protect.
func transparentPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			alpha := uint8(255)
			if x < width/2 {
				alpha = 0
			}
			canvas.Set(x, y, color.RGBA{R: 20, G: 120, B: 200, A: alpha})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, canvas); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

// TestPlanSkipsWhatCannotBeDerived pins four decisions together, because each of them is a choice
// rather than a limitation of the code: a derivative of an animation is a still, a video cannot be
// decoded without a tool this repository does not ship, and upscaling spends bytes to look worse.
func TestPlanSkipsWhatCannotBeDerived(t *testing.T) {
	for _, testCase := range []struct {
		name        string
		contentType string
		width       int
		want        []string
	}{
		{"a phone photo gets both", "image/jpeg", 4032, []string{"thumb", "large"}},
		{"a wide screenshot gets both", "image/png", 2560, []string{"thumb", "large"}},
		{"one between the caps gets the thumb only", "image/jpeg", 900, []string{"thumb"}},
		{"one narrower than every cap gets none", "image/jpeg", 320, nil},
		{"one exactly at the cap gets none", "image/jpeg", ThumbWidth, nil},
		{"a webp is derivable", "image/webp", 2000, []string{"thumb", "large"}},
		{"an animated gif is not", "image/gif", 2000, nil},
		{"a video is not", "video/mp4", 1920, nil},
		{"a webm is not", "video/webm", 1920, nil},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			names := []string{}
			for _, variant := range Plan(testCase.contentType, testCase.width) {
				names = append(names, variant.Name)
			}
			if len(names) != len(testCase.want) {
				t.Fatalf("expected %v, got %v", testCase.want, names)
			}
			for index, want := range testCase.want {
				if names[index] != want {
					t.Fatalf("expected %v, got %v", testCase.want, names)
				}
			}
		})
	}
}

// TestEncodeShrinksAndKeepsTheFormat is the measurement the item is about: a derivative of a real
// photo is a fraction of the original's bytes, decoded at the cap's width. The fixture is a 12
// megapixel photo — 3200x2400 — because that is the phone picture the item is about, and it is
// wider than both caps, so both derivatives exist to be measured.
func TestEncodeShrinksAndKeepsTheFormat(t *testing.T) {
	const sourceWidth, sourceHeight = 3200, 2400
	source := photo(t, sourceWidth, sourceHeight)
	thumbnail, ok := Lookup("thumb")
	if !ok {
		t.Fatal("thumb is not a variant")
	}
	encoded, outputType, err := Encode(source, "image/jpeg", thumbnail)
	if err != nil {
		t.Fatalf("encoding a thumb: %v", err)
	}
	if outputType != "image/jpeg" {
		t.Fatalf("a JPEG derivative should stay JPEG, got %s", outputType)
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	wantHeight := sourceHeight * ThumbWidth / sourceWidth
	if format != "jpeg" || config.Width != thumbnail.Width || config.Height != wantHeight {
		t.Fatalf("expected a %dx%d jpeg, got %s %dx%d", thumbnail.Width, wantHeight, format, config.Width, config.Height)
	}
	if len(encoded) >= len(source) {
		t.Fatalf("the thumbnail must be smaller than the original: %d vs %d", len(encoded), len(source))
	}

	large, ok := Lookup("large")
	if !ok {
		t.Fatal("large is not a variant")
	}
	bigger, _, err := Encode(source, "image/jpeg", large)
	if err != nil {
		t.Fatalf("encoding a large: %v", err)
	}
	t.Logf("%dx%d jpeg: thumb %d bytes, large %d bytes, original %d bytes",
		sourceWidth, sourceHeight, len(encoded), len(bigger), len(source))
	if len(bigger) >= len(source) {
		t.Fatalf("the large derivative must be smaller than the original too: %d vs %d", len(bigger), len(source))
	}
}

// TestEncodeRefusesToUpscale is the boundary the whole "caps are caps" story rests on, and it
// covers the edge a cap of exactly the image's width lands on: no derivative, not a copy.
func TestEncodeRefusesToUpscale(t *testing.T) {
	thumbnail, _ := Lookup("thumb")
	for _, width := range []int{400, ThumbWidth} {
		if _, _, err := Encode(photo(t, width, 300), "image/jpeg", thumbnail); !errors.Is(err, ErrAlreadyNarrow) {
			t.Fatalf("a %dpx image has no %dpx derivative to make, got %v", width, ThumbWidth, err)
		}
	}
}

// TestEncodeKeepsTransparency covers the reason PNG sources become PNG derivatives: a JPEG
// derivative of a see-through image would flatten it.
func TestEncodeKeepsTransparency(t *testing.T) {
	source := transparentPNG(t, 1000, 600)
	thumbnail, _ := Lookup("thumb")
	encoded, outputType, err := Encode(source, "image/png", thumbnail)
	if err != nil {
		t.Fatal(err)
	}
	if outputType != "image/png" {
		t.Fatalf("a PNG derivative should stay PNG so alpha survives, got %s", outputType)
	}
	decoded, err := png.Decode(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, alpha := decoded.At(0, 0).RGBA(); alpha != 0 {
		t.Fatalf("the transparent half of the image came out opaque: alpha=%d", alpha)
	}
}

// TestEncodeReportsWhatItCannotDecode covers the realistic failure mode: an animated WebP has no
// decoder here, and the upload keeps it whole rather than failing or writing a broken derivative.
func TestEncodeReportsWhatItCannotDecode(t *testing.T) {
	thumbnail, _ := Lookup("thumb")
	_, _, err := Encode([]byte("RIFF____WEBPVP8X not really a webp payload"), "image/webp", thumbnail)
	if err == nil {
		t.Fatal("undecodable bytes must be reported")
	}
	if errors.Is(err, ErrAlreadyNarrow) {
		t.Fatalf("undecodable is not the same as too narrow: %v", err)
	}
}

// TestGIFDecodesButIsNotDerived keeps two rules apart: GIF has a decoder in this toolchain, and
// the reason it gets no derivative is the animation, not the code.
func TestGIFDecodesButIsNotDerived(t *testing.T) {
	canvas := image.NewPaletted(image.Rect(0, 0, 800, 600), []color.Color{color.Black, color.White})
	var encoded bytes.Buffer
	if err := gif.Encode(&encoded, canvas, nil); err != nil {
		t.Fatal(err)
	}
	if _, _, err := image.Decode(bytes.NewReader(encoded.Bytes())); err != nil {
		t.Fatalf("this fixture was meant to decode, so the refusal must be about animation: %v", err)
	}
	if planned := Plan("image/gif", 800); planned != nil {
		t.Fatalf("a gif must be left whole, got %v", planned)
	}
}

// TestParseSizeRefusesATypo is the "a typo is not a full-size download" rule.
func TestParseSizeRefusesATypo(t *testing.T) {
	for _, testCase := range []struct {
		value      string
		wantName   string
		understood bool
	}{
		{"", "", true},
		{"original", "", true},
		{"thumb", "thumb", true},
		{"large", "large", true},
		{"thumbs", "", false},
		{"THUMB", "", false},
		{"../thumb", "", false},
		{"thumb;drop", "", false},
	} {
		variant, understood := ParseSize(testCase.value)
		if understood != testCase.understood {
			t.Fatalf("ParseSize(%q) understood=%v, want %v", testCase.value, understood, testCase.understood)
		}
		if understood && variant.Name != testCase.wantName {
			t.Fatalf("ParseSize(%q) = %q, want %q", testCase.value, variant.Name, testCase.wantName)
		}
	}
}

// TestFileNamesRoundTripAndCannotEscape is the naming contract the upload path and the collector
// share: what one writes, the other reads, and a name that is not derivative-shaped is refused.
//
// It also pins the division of labour that the stray sweep depends on. This helper is about
// *shape* only, so `id_thumb_thumb` parses as a derivative of the base `id_thumb` and
// `notes_large` as one of `notes`; the caller is what insists the base is a UUID, which is how
// the collector keeps its promise never to touch a file an operator put in the directory.
func TestFileNamesRoundTripAndCannotEscape(t *testing.T) {
	const id = "8f14e45f-ceea-467a-9c1c-1a1a1a1a1a1a"
	for _, variant := range Variants() {
		name := FileName(id, variant)
		if name != id+"_"+variant.Name {
			t.Fatalf("unexpected name %q", name)
		}
		gotID, gotVariant, ok := ParseFileName(name)
		if !ok || gotID != id || gotVariant != variant {
			t.Fatalf("ParseFileName(%q) = %q, %v, %v", name, gotID, gotVariant, ok)
		}
	}
	for _, name := range []string{id, "_thumb", "thumb", "", "notes.txt", "notes-pdf"} {
		if gotID, variant, ok := ParseFileName(name); ok {
			t.Fatalf("ParseFileName(%q) is not derivative-shaped, got %q %v", name, gotID, variant)
		}
	}
	for name, wantBase := range map[string]string{
		"id_thumb_thumb": "id_thumb",
		"notes_large":    "notes",
		"../evil_thumb":  "../evil",
	} {
		gotID, _, ok := ParseFileName(name)
		if !ok || gotID != wantBase {
			t.Fatalf("ParseFileName(%q) = %q, %v; the shape is fine, the base is the caller's business", name, gotID, ok)
		}
	}
}
