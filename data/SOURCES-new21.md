# Data added with src/tools/new21.js

## world-110m.json (tools choropleth-map-maker, travel-map-pinner, geography-quiz-map, csv-to-map-plotter)
- Source: Natural Earth 1:110m Cultural Vectors, Admin 0 Countries (ne_110m_admin_0_countries), via https://github.com/nvkelso/natural-earth-vector (geojson/ne_110m_admin_0_countries.geojson), fetched 2026-10-23.
- Licence: public domain (Natural Earth terms of use: "All versions of Natural Earth raster + vector map data found on this website are in the public domain"). No attribution required.
- DERIVED: coordinates rounded to 0.1 degree, only outer rings kept (lakes and enclaves are dropped), properties reduced to n (NAME), a2 (ISO_A2_EH), a3 (ISO_A3_EH, or ADM0_A3 when none), c (CONTINENT). Generated with an ad-hoc python script (json only), not shipped.
- Limits: the 110m scale omits many small countries and islands; borders follow Natural Earth's de facto choices and are not a statement on any dispute.
- sha256 of the shipped file: b6549342f90b638416b7a255c5ef767802b7bbae41aa5a97c172e1cffb525880 (122,834 bytes)
