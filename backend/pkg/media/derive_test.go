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

func TestEncodeRefusesToUpscale(t *testing.T) {
	thumbnail, _ := Lookup("thumb")
	for _, width := range []int{400, ThumbWidth} {
		if _, _, err := Encode(photo(t, width, 300), "image/jpeg", thumbnail); !errors.Is(err, ErrAlreadyNarrow) {
			t.Fatalf("a %dpx image has no %dpx derivative to make, got %v", width, ThumbWidth, err)
		}
	}
}

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
