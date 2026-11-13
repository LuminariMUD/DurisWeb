# Eclipse artwork and atmosphere

Assets for the homepage hero in
[`FrontPageView.vue`](../../views/FrontPageView.vue), following the
[Design guide](../../../../docs/DESIGN.md#homepage-assets-and-configuration).

- `duris-eclipse.webp`: 1672 × 941, the generated decorative eclipse artwork. It
  is also the default profile banner.
- `mist.webp`: 1024 × 384, 5,676 bytes, a procedural mist texture that tiles
  horizontally. Added on 2026-11-13.

## Artwork registration

The hero animates light the painting already has, so its overlays are measured
against `duris-eclipse.webp` rather than placed by eye.

| Measurement | Pixels | Share of the artwork |
|---|---|---|
| Eclipse centre | 1172.4, 229.3 | 70.12% across, 24.36% down |
| Eclipse radius | 161.9 | diameter is 19.37% of the width |
| Castle, measured clockwise from the top of the disc | 124° to 226° | masked out of the corona |

The centre and radius come from a least-squares circle fit to the bright rim
(residual 0.8 px). `.hero-scene` and `.corona` in `FrontPageView.vue` use these
values. Measure them again if the artwork is replaced, cropped, or resized to a
different aspect ratio; a corona that is a few pixels off the rim is obvious.

An operator-supplied hero image has no registration, so it gets the mist, embers,
and drift without the corona.

## Mist texture

`mist.webp` is original and procedural: no source image, photograph, or image
model was used. Spectrally shaped noise is built in Fourier space, which makes it
periodic, then curled by a second noise field and thresholded into banks with
gaps. The vertical falloff is baked in, so the texture needs no mask: it is black
at the top and fullest about three quarters down. It is drawn with
`mix-blend-mode: screen`, where black adds nothing.

Generated with Python 3, NumPy 2.4.2, and Pillow 10.2.0. Seeds are fixed, so the
script reproduces the same field; other library versions may encode different
bytes for the same picture.

```python
import numpy as np
from PIL import Image

W, H = 1024, 384


def periodic_noise(h, w, beta, stretch, seed):
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt((fx * stretch * h / w) ** 2 + fy**2)
    f[0, 0] = 1.0
    amp = f**-beta
    amp[0, 0] = 0.0
    field = np.fft.ifft2(amp * np.exp(2j * np.pi * rng.random((h, w)))).real
    lo, hi = np.percentile(field, [0.5, 99.5])
    return np.clip((field - lo) / (hi - lo), 0, 1)


def sample_wrapped(img, ys, xs):
    h, w = img.shape
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy, fx = ys - y0, xs - x0
    y0 %= h
    x0 %= w
    y1, x1 = (y0 + 1) % h, (x0 + 1) % w
    return (
        img[y0, x0] * (1 - fy) * (1 - fx)
        + img[y0, x1] * (1 - fy) * fx
        + img[y1, x0] * fy * (1 - fx)
        + img[y1, x1] * fy * fx
    )


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


yy, xx = np.mgrid[0:H, 0:W].astype(float)
body = periodic_noise(H, W, beta=2.0, stretch=2.4, seed=12)
warp_x = periodic_noise(H, W, beta=2.2, stretch=1.6, seed=21) - 0.5
warp_y = periodic_noise(H, W, beta=2.2, stretch=1.6, seed=22) - 0.5
detail = periodic_noise(H, W, beta=1.7, stretch=2.0, seed=33)

billow = sample_wrapped(body, yy + warp_y * 60, xx + warp_x * 120)
density = smoothstep(0.34, 0.84, billow) * (0.72 + 0.28 * detail)

v = yy / (H - 1)
envelope = smoothstep(0.0, 0.62, v) * (1 - 0.3 * smoothstep(0.82, 1.0, v))
fog = np.clip(density * envelope, 0, 1)

tint = np.array([236, 229, 214], dtype=float)  # warm bone
rgb = (fog[..., None] * tint).round().astype(np.uint8)
Image.fromarray(rgb, "RGB").save("mist.webp", "WEBP", quality=50, method=6)
```
