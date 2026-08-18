# Santa Barbara hero geospatial assets

## Display contract

The homepage hero is a registered map composition, not an illustrative map.
Every generated geographic layer uses the same 1800 by 1800 EPSG:4326 grid,
the same bounds, and the same browser camera transform:

- West: -119.87
- South: 34.27
- East: -119.56
- North: 34.53
- Camera: 120 degree rotation, 1.46 scale
- Registration ID: `santa-barbara-wgs84-20260808-v1`

The browser draws the layers in this order: full-frame ocean base, optional
depth shading, USGS contours, opaque land-only Sentinel image, NOAA shoreline,
harbor marker, attribution, and the opportunity card. The rounded hero panel is
the only clipping boundary.

## Authoritative sources

### Bathymetry

The displayed contours come only from the U.S. Geological Survey Data Series
702 merged Santa Barbara Channel 10 m bathymetry:

- Source: https://pubs.usgs.gov/ds/702/data.html
- Archive: https://pubs.usgs.gov/ds/702/data/bathymetry/sbchannel_10mbathy.zip
- Archive SHA-256: `5ae764fe1d154b43deb2dcd1c1a1de253c737abb5b2221529783ccbead79453b`
- Native horizontal CRS: NAD83 / UTM zone 11N (`EPSG:26911`)
- Vertical datum: NAVD88
- Native cell size: 10 m
- Display interval: 10 m, from -10 m through -400 m where data exists
- Accessed: 2026-08-08

Data Series 702 was selected because the hero camera extends beyond the local
Data Series 781 Offshore Santa Barbara contour bounds. Using DS 781 alone would
reproduce the visible blank-water edge that this change removes.

### Land/water mask and shoreline

The binary land mask and zero-elevation shoreline come from NOAA NCEI's Santa
Barbara 1/3 arc-second Mean High Water Coastal DEM:

- Metadata: https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ngdc.mgg.dem%3A603/html
- WCS subset CRS: `EPSG:4326`
- Vertical datum: Mean High Water
- Subset SHA-256: `ce65ca314f35ec91effe0a5aa6465f2ded9542e5857323e4b487f4f70a62ec31`
- Accessed: 2026-08-08

The NOAA elevations are not used to create or fill bathymetric contours. They
only classify land versus water and provide the displayed zero shoreline. This
keeps the DS 702 NAVD88 contour values internally consistent instead of mixing
vertical datums.

### Land imagery

The opaque land-only visual is Copernicus Sentinel-2 L2A true color from
Element84 Earth Search item `S2B_11SKU_20251017_0_L2A`:

- Item: https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_11SKU_20251017_0_L2A
- Native CRS: WGS84 / UTM zone 11N (`EPSG:32611`)
- Native resolution: 10 m
- Accessed: 2026-08-08

The Sentinel image is reprojected to the shared output grid and receives the
NOAA-derived alpha mask. The final land mask is dilated two output pixels
offshore to prevent antialiased ocean color or contours from leaking onto land.

## Reproduction

Create an isolated Python environment and run:

```bash
python3 -m venv /tmp/castingcompass-geo
/tmp/castingcompass-geo/bin/pip install -r scripts/santa-barbara-hero-requirements.txt
GDAL_CACHEMAX=512 /tmp/castingcompass-geo/bin/python scripts/generate-santa-barbara-hero-assets.py
```

The generator verifies the downloaded USGS and NOAA hashes before processing.
It writes:

- `public/marketing/daylight-draft/santa-barbara-land.png`
- `public/marketing/daylight-draft/santa-barbara-hero-geometry.json`

The geometry manifest records source metadata, processing details, contour
depths, edge coverage, known land/water probes, and the generated land hash.

## Limitations

This display is not for navigation. Data Series 702 is a historical compilation
and native resolution does not imply positional or vertical accuracy. Areas
without valid DS 702 cells are left without invented contours. The top edge of
the registered frame is land and therefore correctly has no bathymetric edge
crossings; valid offshore contours reach the left, right, and bottom edges.
