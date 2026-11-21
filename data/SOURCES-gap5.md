# Data and model files added with src/tools/gap5.js

Fetched 2026-10-23 with plain curl, no login or licence acceptance. Every Hugging Face `model.safetensors` below has a sha256 equal to the LFS oid published by the Hugging Face API (`/api/models/<id>/tree/main`). Shipped files marked DERIVED are produced by the scripts in `scripts/` (named below); the tests compare the JavaScript engines with PyTorch / reference implementations (`test/gap5-*.mjs`, fixtures in `test/fixtures/gap5-*`).

## fillmask-distilbert-base-uncased.bin + sentiment-vocab.txt (src/gap5lib/distilbert.js, tool ai-fill-mask)
- Model: distilbert/distilbert-base-uncased at revision 12040accade4e8a0f71eabdb258fecc2e7e948be (DistilBertForMaskedLM)
- URL: https://huggingface.co/distilbert/distilbert-base-uncased/resolve/main/model.safetensors
- License: Apache-2.0 (model card metadata)
- Original model.safetensors sha256 5e3f1108e3cb34ee048634875d8482665b65ac713291a7e32396fb18f6ff0063 (267,954,768 bytes). vocab.txt is byte-identical to the already shipped `sentiment-vocab.txt` (sha256 07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3; git blob sha1 fb140275c155a9c7c5a3b3e0e77a9e839594a938 equals the HF oid).
- DERIVED fillmask-distilbert-base-uncased.bin: DBS1 container as for the sentiment model (int8 weights, fp16 scale per 64 inputs, float32 biases and LayerNorm; the vocabulary projection is tied to the word embeddings and only its bias is stored). `python3 -I scripts/pack-gap5-distilbert.py mlm model.safetensors data/fillmask-distilbert-base-uncased.bin`
- shipped sha256: 47cd55ba0bf6067c753356e3b631bac393dc330d20bf2907a6b6eb3a86663085 (69,368,288 bytes)
- Verification (test/gap5-models.mjs): our WordPiece token ids equal transformers' on accented, CJK, punctuation and whitespace cases; on 8 masked positions the top-1 word equals the float32 PyTorch pipeline in 8/8 and the top-3 sets match; max probability difference on the top word 0.011.

## qa-distilbert-base-cased-squad.bin + qa-vocab-cased.txt (src/gap5lib/distilbert.js, tool ai-question-answering)
- Model: distilbert/distilbert-base-cased-distilled-squad at revision 564e9b582944a57a3e586bbb98fd6f0a4118db7f (trained on SQuAD v1.1)
- URL: https://huggingface.co/distilbert/distilbert-base-cased-distilled-squad/resolve/main/model.safetensors
- License: Apache-2.0 (model card metadata)
- Original model.safetensors sha256 f198de8ef6e40aeccd6eaa86e34dde73c3bb4bf0e54003cd182a18c29a1811db (260,782,156 bytes); vocab.txt shipped unchanged as qa-vocab-cased.txt, sha256 eeaa9875b23b04b4c54ef759d03db9d1ba1554838f8fb26c5d96fa551df93d02 (git blob sha1 2ea941cc79a6f3d7985ca6991ef4f67dad62af04 equals the HF oid).
- DERIVED qa-distilbert-base-cased-squad.bin: same container, `python3 -I scripts/pack-gap5-distilbert.py qa model.safetensors data/qa-distilbert-base-cased-squad.bin`; the 2x768 `qa_outputs` head stays float32.
- shipped sha256: d25a1560075a94078aad3c642398f48b25b4a762b5bc72ccdbb938d12166a93d (67,426,088 bytes)
- Verification (test/gap5-models.mjs): 6 question/passage pairs (including a passage of about 900 words that needs three windows) return the same answer text and character offsets as the transformers question-answering pipeline on the float32 model; scores differ by at most 0.005.

## lid.176.ftz (src/gap5lib/langid.js, tool ai-language-identifier)
- Model: fastText language identification, compressed version (176 languages)
- URL: https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.ftz (linked from https://fasttext.cc/docs/en/language-identification.html)
- License: Creative Commons Attribution-Share-Alike 3.0 (stated on that page). Attribution: Facebook AI Research / fastText, "Bag of Tricks for Efficient Text Classification" and "FastText.zip: Compressing text classification models" (Joulin et al.). The file is shipped unchanged.
- sha256: 8f3472cfe8738a7b6099e8e999c3cbfae0dcd15696aac7d7738a8039db603e83 (938,013 bytes). fastText publishes no checksum; the value was computed on download.
- Verification (test/gap5-langid.mjs): top-3 labels and probabilities of 20 texts in 14 scripts equal the reference fastText predictor (python `fasttext-predict`) to 1e-4. The model uses hierarchical softmax; the Huffman tree is rebuilt from the label counts exactly as fastText does.

## mobilenetv2-100-ra-in1k.bin + imagenet-labels.json (src/gap5lib/imageclass.js, tool ai-image-classifier)
- Model: timm/mobilenetv2_100.ra_in1k at revision 5afa12513b048c79b9147a5d210e9bdc50035481 (trained on ImageNet-1k)
- URL: https://huggingface.co/timm/mobilenetv2_100.ra_in1k/resolve/main/model.safetensors
- License: Apache-2.0 (model card metadata). Note: the training data, ImageNet-1k, has its own terms of access (non-commercial research use); the weights are widely redistributed under Apache-2.0 and the model card declares that licence.
- Original model.safetensors sha256 55ea4fb3a96010b933710ebf44fc965b070d5cd054d3f35e44f2d1320b4a714e (14,184,144 bytes)
- DERIVED mobilenetv2-100-ra-in1k.bin: batch norm folded into the convolutions in float64, weights stored float16, biases float32. `python3 scripts/pack-gap5-mobilenet.py model.safetensors data/mobilenetv2-100-ra-in1k.bin data/imagenet-labels.json`. shipped sha256 01789ab4391a6ded3c2a91c305217fcca3bec3ba4994b9012534bbffd41c7b63 (7,017,292 bytes)
- imagenet-labels.json: the 1000 ImageNet class names from the `timm` package (`ImageNetInfo().index_to_description`, WordNet lemmas), sha256 4e48e3093b51975e4f34254f137f16b9d9355597a82f2632f2ea10b4bd99d654
- Verification (test/gap5-image.mjs): on three deterministic 224x224 tensors the top-5 classes equal timm's and the first five logits differ by at most 0.0043 (float16 weights).

## whisper-tiny-en.bin + whisper-tiny-en-vocab.json (src/gap5lib/whisper.js, tool ai-speech-to-text)
- Model: openai/whisper-tiny.en at revision 87c7102498dcde7456f24cfd30239ca606ed9063
- URL: https://huggingface.co/openai/whisper-tiny.en/resolve/main/model.safetensors (plus vocab.json, added_tokens.json, preprocessor_config.json for the mel filter bank, generation_config.json for the suppress-token lists)
- License: Apache-2.0 per the Hugging Face model card metadata (OpenAI released the Whisper code and weights under MIT; both permit this use)
- Original model.safetensors sha256 db59695928ded6043adaef491a53ef4e12da9611184d77c53baa691a60b958ad (151,060,136 bytes)
- DERIVED whisper-tiny-en.bin: attention and feed-forward matrices and the token embedding int8 (fp16 scale per 64 inputs), everything else float32, plus the 80x201 mel filter bank. `python3 -I scripts/pack-gap5-whisper.py <dir> data` (also writes whisper-tiny-en-vocab.json, the token strings by id). shipped sha256 56c76cde6bf3f7ccac53496ebed3cfa6c7dd34fe22a893cc649e7a84eec8b01e (42,966,124 bytes); vocab sha256 2846bb0b586c1d9b1b5e29d5f31408a289134c983b212846b9b68f9923ebcb36
- Verification (test/gap5-whisper.mjs, 11 s public-domain JFK clip from github.com/openai/whisper/tests/jfk.flac, resampled to 16 kHz in test/fixtures/gap5-jfk-16k.wav): log-mel max difference 6e-8 from the Hugging Face feature extractor; encoder output within 0.02; the 24 generated token ids and the transcript are identical to transformers' float32 greedy decoding.

## smollm2-135m-instruct-q4.bin + smollm2-vocab.json (src/gap5lib/llm.js, tool ai-offline-chat)
- Model: HuggingFaceTB/SmolLM2-135M-Instruct at revision 12fd25f77366fa6b3b4b768ec3050bf629380bac
- URL: https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/resolve/main/model.safetensors (plus tokenizer.json, config.json)
- License: Apache-2.0 (model card metadata)
- Original model.safetensors sha256 5af571cbf074e6d21a03528d2330792e532ca608f24ac70a143f6b369968ab8c (269,060,552 bytes)
- DERIVED smollm2-135m-instruct-q4.bin: every 2-D weight including the tied embedding is symmetric 4-bit round-to-nearest in groups of 32 with a float16 scale; norms float32. `python3 -I scripts/pack-gap5-smollm.py <dir> data`. shipped sha256 8ee2d4b6bab29ce1b6aef8e04ae442a7a1948991d6234686634e133ec39d45e8 (75,807,780 bytes); smollm2-vocab.json (vocabulary and BPE merges from tokenizer.json) sha256 25b0952bc87679d533dcf211fd7fdc91678b803a55cc71e65efbd778503c62f5
- Quality cost of 4 bits (measured with PyTorch on this repository's markdown): perplexity 56 against 39 for float32 (int8 would be 38.5 but 135 MB). The page says so.
- Verification (test/gap5-llm.mjs): token ids of five strings and of the chat template equal transformers'; greedy completions of five prompts (36 tokens each) are identical to PyTorch run on the same dequantised weights (`--dequantized-out` option of the pack script).

## ip-country.bin (tool ip-address-offline-lookup)
- Source: the "delegated-extended-latest" statistics files of the five Regional Internet Registries, serial date 2026-10-22: https://ftp.afrinic.net/stats/afrinic/, https://ftp.apnic.net/stats/apnic/, https://ftp.arin.net/pub/stats/arin/, https://ftp.lacnic.net/pub/stats/lacnic/, https://ftp.ripe.net/pub/stats/ripencc/ (sha256 of the files used: afrinic d3783db60d0322fb7f456ff797e08fad1ba0ceaa26682864df68cfa987a87e19, apnic f5ebfdaa5cdba81ee829e1b8949d41756e565b47a4f939992810f9ebda6a31db, arin 362c0c3f82f98b168e58b98cef6cc9f9544136f10bd01414a82ac213fc50c6dd, lacnic 318d7b80726c7c5190dc3cb7b26a89a8b41804692e0b5d9880c7a2a6ca8d4238, ripencc ecc75a5ce3e65920d95a91a8f6c7e7bdbbf878ceb608623dc3a72ecec581499f)
- Terms: the registries publish these files for public download; the APNIC file states the files "are freely available for download and use on the condition that APNIC will not be held responsible for any loss or damage"; the other files carry no licence text. Only the registry, country and range are kept (facts about allocations); opaque ids and dates are dropped. If a registry objects, drop the file and rebuild.
- DERIVED: IPv4 ranges (allocated or assigned, country not empty) merged when adjacent with the same country and registry, IPv6 prefixes by their first 64 bits. `python3 -I scripts/build-gap5-data.py <dir with the five files> hs.csv data`. 144,105 IPv4 ranges, 70,974 IPv6 prefixes, 239 country codes. shipped sha256 63a7c2a1fad40e9723fc9cf4dac974d531f1d4ce08cb643afcbaa881f1059103 (2,222,262 bytes).
- Verification (test/gap5-tools.mjs): 310 random addresses (inside allocations and uniformly random) return the country found by a linear scan of the raw RIR files. Country names come from `Intl.DisplayNames` (CLDR) in the browser, not from a shipped table.

## IANA special-purpose registries (embedded in src/tools/gap5.js, tool ip-address-offline-lookup)
- https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry-1.csv and https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry-1.csv, fetched 2026-10-23. IANA publishes the registries openly and attaches no licence restriction; only the address blocks, names and RFC numbers are used.

## hs-2022.tsv (tool hs-code-lookup)
- Source: https://github.com/datasets/harmonized-system, file `data/harmonized-system.csv` (HS 2022, six-digit codes, from UN Comtrade, which extracts the WCO nomenclature)
- License: ODC Public Domain Dedication and Licence (PDDL 1.0) stated in the project's datapackage.json and README. The WCO owns the copyright in the official HS texts; the dataset maintainers publish the code list and short descriptions under the PDDL, and we rely on that. Use the national tariff for binding classification.
- DERIVED: three tab-separated columns (code, section, description) in the original order, 6,940 rows. shipped sha256 5b33a755a69bef3c388e555537d6da204c0cf537bb557d535c6262ab83662806 (793,520 bytes). Section names (21 titles) are embedded in src/tools/gap5.js.

## Tax / company number checksums (tool tax-id-checksum-validator)
- Algorithms are the published national check-digit schemes (weights and moduli). No data files. Compared against python-stdnum (LGPL, used only as a test oracle, no code copied) on 531,000 generated numbers; deliberate differences: Belgium (we require the official 97 - n mod 97, python-stdnum also accepts check values 98 and 99) and Spain CIF (we require a letter for P, Q, R, S, N, W and a digit for A, B, E, H, as the Agencia Tributaria specifies).
