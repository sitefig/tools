# Data added with src/tools/new23.js (second pass). All retrieved 2026-10-23.

## oui.tsv (tool mac-address-vendor-lookup), 1,680,313 bytes, 54,275 blocks
- Sources: IEEE Registration Authority public listings https://standards-oui.ieee.org/oui/oui.csv (MA-L), /oui28/mam.csv (MA-M), /oui36/oui36.csv (MA-S).
  Input sha256: oui.csv 6b725e8467e61037837f8c3c4f4bf7b9f60e0f7446505584a3f2978d5d1a0c79, mam.csv 83b2373b48bba57bc959f79b50e016621fd572558ec6eede66f4f751a2d4ee0c, oui36.csv 6fca16f31dbf0eafd2025872683950ef5bd89c9534ce209573eea50b143b5983.
- LICENCE: the IEEE publishes these lists for public download and states no open licence or redistribution terms on the listing pages or the Registration Authority FAQ (checked). The same data is widely redistributed (Wireshark manuf, nmap, Linux hwdata). OWNER DECISION: confirm you are comfortable shipping it; to be conservative the bundle holds only block id and organisation name (no addresses), and "Private" entries are stored as empty names.
- DERIVED: tab-separated `block<TAB>name`, whitespace collapsed, sorted by block length then value. sha256 of shipped file: 3bc08c378343ec6a0ae2f5aa8e4c569a77ef25c7294c55df078f93d486460e6a.

## tlds.tsv (tool tld-info-lookup), 65,191 bytes, 1,437 TLDs
- Sources: https://data.iana.org/TLD/tlds-alpha-by-domain.txt ("Version 2026102300, Last Updated Fri Oct 23 07:07:01 2026 UTC", sha256 274be608419b2c4ae93966cd8e98f6783628312e371c406c0b3a88ca945daa89) joined with the IANA Root Zone Database table https://www.iana.org/domains/root/db (type and manager).
- LICENCE: IANA states no licence on these pages; it is public registry data (names, type, manager organisation). Treated as factual public data; OWNER may confirm.
- DERIVED: `punycode<TAB>unicode(if IDN)<TAB>type<TAB>manager`. The root zone page lists type only as Generic, Country Code or Special Use. sha256: 5a28025ccf897387d47b0d3047c5852eb92eedb7f55f3d0c430cdf57d77a4658.

## bsc-bright.tsv (tool night-sky-viewer), 80,459 bytes
- Stars: Yale Bright Star Catalogue 5th rev. ed. (Hoffleit and Jaschek 1991), NASA ADC/CDS V/50, file http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz (sha256 of the gz 0471ced07fc241e625613baa689b2fa5f4b59fd733f731003e57d2d436036cdb; bsc5.dat 69797549cc1605aad7ff94e9325e29a1661f2a253917faaa056d9bf20b809afd). Catalogue distributed by the NASA Astronomical Data Center without use restrictions; US government/academic data, treated as freely redistributable (no licence text in the ReadMe).
- Proper names: IAU Working Group on Star Names catalogue, https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt (sha256 84fac0c90f1b19abc491c2793469e0caa7b003ad1bc93a790ca41147010d0eb0), matched by HR number. The IAU asks users to cite https://www.iau.org/public/themes/naming_stars/.
- Constellation names: the IAU list in astropy's constellation_names.dat (BSD-3 package data; IAU names via VizieR). Two typos in that file corrected by hand: Chamaeleon, Ophiuchus.
- DERIVED: V<=5.0 (1,629 stars), J2000 RA/Dec in degrees, V, B-V, spectral type. HR 5958 (T CrB) removed because the catalogue records its 1946 nova outburst magnitude (2.0). `@Abbr<TAB>Name` lines list the 88 constellations. sha256: 68d38398673e2974b451e14d6d34f635171a53850e39fe026b499ebd46472a42.

## Inline data in new23.js
- 949 color names and sRGB values: xkcd color survey https://xkcd.com/color/rgb.txt, CC0 (the file header says so), sha256 450cca88fa6fa9a1e79c969969e05e6900b41a94f0a3a5f134e3d0b79077f890.
- Orbital elements and perturbation terms for Sun, Moon and planets: P. Schlyter, https://stjarnhimlen.se/comp/ppcomp.html (formulas only, hand-typed from the page; verified against astropy, see peerreview/new-list/pass2-A.md).

## Used only to verify, not shipped
- GOV.UK bank holidays https://www.gov.uk/bank-holidays.json (sha256 538b3482c28b85ecd2db606a0d5ae6ad17248900b6498700ce0a48d26a3ecde6); python-holidays 0.107 (MIT); astropy builtin ephemeris; scikit-image deltaE_ciede2000.
