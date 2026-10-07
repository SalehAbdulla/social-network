// Image generation and media registration for the showcase seed.
//
// The showcase needs pictures — avatars, cover photos, post, story and group images — and it
// needs them to survive the app's own bookkeeping. Rather than point at an external placeholder
// service (which a machine running the tests offline cannot reach) it draws its own, with the
// standard library's PNG encoder and the drawing helper `golang.org/x/image` already carries.
// Nothing here adds a dependency: the font is the tiny bitmap face of `basicfont`, scaled up,
// exactly because pulling a real OpenType face would drag `x/text` into a module that deliberately
// does not carry it.
//
// Every file is written under the upload directory with a deterministic UUID name and recorded in
// the `media` table, so `GET /api/v1/media/{id}` serves it and the orphan collector — which only
// ever touches a UUID-named file with no referencing row — leaves it alone.
package main

import (
	"bytes"
	"database/sql"
	"image"
	"image/color"
	stddraw "image/draw"
	"image/png"
	"math/rand"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// seedNamespace keeps every generated id in one place, so a file or row this package writes is
// recognisable and re-derived the same way on a second run.
const seedNamespace = "social-network/showcase/"

// seedUUID derives a stable v5 (SHA-1) UUID from a key. A deterministic name is what makes the
// seed idempotent: run it twice and the same avatar is written over the same file and points at
// the same `media` row, rather than leaving a second copy nobody references.
func seedUUID(key string) string {
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(seedNamespace+key)).String()
}

// mediaSeeder writes generated images and records them. It works through the seed's transaction so
// a media row can never outlive a rolled-back seed.
type mediaSeeder struct {
	exec func(query string, args ...any) (sql.Result, error)
	dir  string
}

// save encodes one image, writes it under its deterministic name and points a `media` row at it,
// answering the URL the rest of the showcase stores. `owner` is the account the row attributes the
// upload to, which the media visibility check reads.
func (m *mediaSeeder) save(key, owner string, img image.Image) (string, error) {
	id := seedUUID("media:" + key)
	var buf bytes.Buffer
	// BestSpeed: these are flat gradients, so the default compression spends seconds chasing a few
	// bytes that a seed command does not care about.
	encoder := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := encoder.Encode(&buf, img); err != nil {
		return "", err
	}
	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(m.dir, id), buf.Bytes(), 0o644); err != nil {
		return "", err
	}
	if _, err := m.exec(`INSERT INTO media (mediaId, userId, contentType) VALUES (?, ?, 'image/png')
		ON CONFLICT(mediaId) DO UPDATE SET userId = excluded.userId, contentType = excluded.contentType`,
		id, owner); err != nil {
		return "", err
	}
	return "/api/v1/media/" + id, nil
}

// palette is one three-stop gradient. The two background tones carry the canvas and the accent is
// what the blobs are drawn from, so a generated picture reads as deliberate rather than as noise.
type palette struct {
	from, to, accent color.RGBA
}

var showcasePalettes = []palette{
	{rgb(0x1e, 0x3a, 0x8a), rgb(0x7c, 0xa6, 0xff), rgb(0xff, 0xd6, 0x6b)},
	{rgb(0x8a, 0x2b, 0xe2), rgb(0xff, 0x7e, 0xb8), rgb(0xff, 0xf3, 0xc4)},
	{rgb(0x0f, 0x76, 0x6e), rgb(0x8a, 0xe0, 0xc1), rgb(0xff, 0xc6, 0x6b)},
	{rgb(0xb4, 0x24, 0x2a), rgb(0xff, 0x9a, 0x62), rgb(0xff, 0xe0, 0x8a)},
	{rgb(0x25, 0x2c, 0x49), rgb(0x5b, 0x8d, 0xef), rgb(0xf7, 0xb2, 0xff)},
	{rgb(0x09, 0x3f, 0x5c), rgb(0x2e, 0xc4, 0xb6), rgb(0xf9, 0xf8, 0x71)},
	{rgb(0x5b, 0x1d, 0x8a), rgb(0xd6, 0x6d, 0xff), rgb(0x9b, 0xff, 0xe0)},
	{rgb(0x1b, 0x5e, 0x20), rgb(0x9c, 0xe6, 0x8a), rgb(0xff, 0xf1, 0x8a)},
	{rgb(0x7a, 0x1f, 0x3d), rgb(0xf7, 0x7f, 0xb0), rgb(0xff, 0xd1, 0x66)},
	{rgb(0x0b, 0x1f, 0x3a), rgb(0x35, 0x6c, 0xa8), rgb(0xc0, 0xe8, 0xff)},
	{rgb(0x53, 0x2b, 0x0e), rgb(0xd9, 0x8c, 0x4a), rgb(0xff, 0xe4, 0xb0)},
	{rgb(0x2d, 0x14, 0x3d), rgb(0x8e, 0x54, 0xc8), rgb(0xff, 0xb3, 0xe6)},
}

func rgb(r, g, b uint8) color.RGBA { return color.RGBA{R: r, G: g, B: b, A: 255} }

func pickPalette(r *rand.Rand) palette { return showcasePalettes[r.Intn(len(showcasePalettes))] }

func lerp(a, b uint8, t float64) uint8 { return uint8(float64(a) + (float64(b)-float64(a))*t) }

// fillGradient paints a diagonal blend of the palette's two background tones.
func fillGradient(img *image.RGBA, p palette) {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			t := (float64(x)/float64(w) + float64(y)/float64(h)) / 2
			img.SetRGBA(b.Min.X+x, b.Min.Y+y, color.RGBA{lerp(p.from.R, p.to.R, t), lerp(p.from.G, p.to.G, t), lerp(p.from.B, p.to.B, t), 255})
		}
	}
}

// addBlobs lays a few soft accent circles over the gradient, which is what stops two pictures from
// the same palette looking identical and gives a busy feed some variety.
func addBlobs(img *image.RGBA, r *rand.Rand, p palette, count int) {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	short := min(w, h)
	for i := 0; i < count; i++ {
		cx, cy := r.Intn(w), r.Intn(h)
		radius := short/4 + r.Intn(short/3+1)
		col := p.accent
		if r.Intn(2) == 0 {
			col = p.to
		}
		// A translucent-edge disc: full over the middle, fading to nothing at the rim.
		minX, maxX := max(0, cx-radius), min(w, cx+radius)
		minY, maxY := max(0, cy-radius), min(h, cy+radius)
		radiusSq := radius * radius
		for y := minY; y < maxY; y++ {
			dy := y - cy
			for x := minX; x < maxX; x++ {
				dx := x - cx
				distSq := dx*dx + dy*dy
				if distSq >= radiusSq {
					continue
				}
				// Squared distance, so the falloff costs no square roots inside the disc.
				edge := 1 - float64(distSq)/float64(radiusSq)
				alpha := edge * edge * 0.55
				dst := img.RGBAAt(b.Min.X+x, b.Min.Y+y)
				img.SetRGBA(b.Min.X+x, b.Min.Y+y, color.RGBA{
					R: lerp(dst.R, col.R, alpha),
					G: lerp(dst.G, col.G, alpha),
					B: lerp(dst.B, col.B, alpha),
					A: 255,
				})
			}
		}
	}
}

// vignette darkens the corners a touch, the way a phone photo does, so a flat gradient reads more
// like a photograph than a UI panel.
func vignette(img *image.RGBA) {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	cx, cy := float64(w)/2, float64(h)/2
	maxSq := cx*cx + cy*cy
	for y := 0; y < h; y++ {
		dy := float64(y) - cy
		for x := 0; x < w; x++ {
			dx := float64(x) - cx
			darken := 1 - 0.28*((dx*dx+dy*dy)/maxSq)
			c := img.RGBAAt(b.Min.X+x, b.Min.Y+y)
			img.SetRGBA(b.Min.X+x, b.Min.Y+y, color.RGBA{uint8(float64(c.R) * darken), uint8(float64(c.G) * darken), uint8(float64(c.B) * darken), 255})
		}
	}
}

// renderText rasterises a short label with the 7×13 bitmap face. The face is tiny on purpose: it
// is scaled up afterwards, which is how a real font is avoided without losing legibility.
func renderText(label string, fg color.RGBA) *image.RGBA {
	face := basicfont.Face7x13
	w := font.MeasureString(face, label).Ceil() + 4
	h := face.Metrics().Height.Ceil() + 4
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	drawer := &font.Drawer{Dst: img, Src: image.NewUniform(fg), Face: face, Dot: fixed.P(2, face.Metrics().Ascent.Ceil()+2)}
	drawer.DrawString(label)
	return img
}

// scaleUp grows a label with a smooth filter, which keeps a scaled 7px glyph from looking shredded.
func scaleUp(src image.Image, factor int) *image.RGBA {
	if factor < 1 {
		factor = 1
	}
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx()*factor, b.Dy()*factor))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, stddraw.Over, nil)
	return dst
}

// drawCentered stamps a scaled label at the middle of a canvas.
func drawCentered(dst *image.RGBA, label *image.RGBA, at image.Point) {
	b := label.Bounds()
	rect := image.Rect(at.X-b.Dx()/2, at.Y-b.Dy()/2, at.X-b.Dx()/2+b.Dx(), at.Y-b.Dy()/2+b.Dy())
	stddraw.Draw(dst, rect, label, b.Min, stddraw.Over)
}

// avatarImage draws a 320×320 profile photo: a gradient, three accent blobs and the member's
// initials, which is what a person would recognise in a feed of twenty of them.
func avatarImage(r *rand.Rand, initials string) *image.RGBA {
	const size = 320
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	p := pickPalette(r)
	fillGradient(img, p)
	addBlobs(img, r, p, 3)
	if initials != "" {
		drawCentered(img, scaleUp(renderText(initials, rgb(255, 255, 255)), 14), image.Pt(size/2, size/2))
	}
	return img
}

// coverImage draws the wide banner a profile header uses.
func coverImage(r *rand.Rand) *image.RGBA {
	const w, h = 1200, 400
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	p := pickPalette(r)
	fillGradient(img, p)
	addBlobs(img, r, p, 5)
	vignette(img)
	return img
}

// photoImage draws a feed photo at one of a few believable aspect ratios.
func photoImage(r *rand.Rand, w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	p := pickPalette(r)
	fillGradient(img, p)
	addBlobs(img, r, p, 4)
	vignette(img)
	return img
}

// storyImage draws the tall canvas a story uses.
func storyImage(r *rand.Rand) *image.RGBA {
	return photoImage(r, 720, 1280)
}

// groupImage draws the square badge a group list shows.
func groupImage(r *rand.Rand, initials string) *image.RGBA {
	const size = 400
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	p := pickPalette(r)
	fillGradient(img, p)
	addBlobs(img, r, p, 4)
	if initials != "" {
		drawCentered(img, scaleUp(renderText(initials, rgb(255, 255, 255)), 18), image.Pt(size/2, size/2))
	}
	return img
}
