
# Tokenizer2 data (src/tools/tokenizer2.js)

Fetched 2026-10-23 with plain curl, no login or licence acceptance. `hf_*.json` and `claude_legacy.tiktoken` are DERIVED files
(vocab + merges + added tokens + pre-tokenizer regexes extracted from the original tokenizer.json / claude.json; nothing else changed).
Format of `hf_*.json`: `{norm, pre:[["split",regex]|["gpt2"]|["digits"]], ms, a:[[id,content,special,lstrip,rstrip]], v:[token by id], m:["a b" merges in rank order]}`; `hf_deepseek-r1.json` has `base` = hf_deepseek-v3.json (identical vocab/merges, different added tokens).

## r50k_base.tiktoken (also serves `gpt2`: tiktoken's gpt2 ranks are identical to r50k_base, verified)
- URL: https://openaipublic.blob.core.windows.net/encodings/r50k_base.tiktoken
- License: MIT (openai/tiktoken)
- sha256: 306cd27f03c1a714eca7108e03d66b7dc042abe8c258b44c199a7ed9838dd930 (835,554 bytes)
- Also checked: gpt-2/encodings/main/{vocab.bpe,encoder.json} (not shipped; equal to the above): vocab.bpe and encoder.json at https://openaipublic.blob.core.windows.net/gpt-2/encodings/main/ ; encoder.json sha256 196139668be63f3b5d6574427317ae82f612a97c5d1cdaf36ed2256dbf636783

## p50k_base.tiktoken
- URL: https://openaipublic.blob.core.windows.net/encodings/p50k_base.tiktoken
- License: MIT (openai/tiktoken)
- sha256: 94b5ca7dff4d00767bc256fdd1b27e5b17361d7b8a5f968547f9f23eb70d2069 (836,186 bytes)

## claude_legacy.tiktoken (LEGACY Claude 1/2 tokenizer; NOT accurate for Claude 3/4/5)
- Source: npm package @anthropic-ai/tokenizer 0.0.4, `claude.json` field `bpe_ranks` (tiktoken-js compressed format) converted to `base64(token) rank` lines. Special tokens and regex are in tokenizer2.js (pat_str and special_tokens from the same claude.json); the package normalizes text with NFKC before encoding.
- URL: https://registry.npmjs.org/@anthropic-ai/tokenizer/-/tokenizer-0.0.4.tgz (npm pack @anthropic-ai/tokenizer)
- License: package.json says Apache-2.0, bundled LICENSE file text is MIT-style ("Copyright 2023 Anthropic, PBC"); both permit this use.
- sha256 tarball: 197ba0ae81d3abb68de9ed0bd5d4c474db866a98cc70a830c8559420ea59768f; claude.json: 58dad83d85e9cd57be209172449ebfbc395df2b455c11fe8b7e5b661e6f462ad
- sha256 shipped file: ba9ebb28e61f5872504fbe44b2f61bd825c222d7d910f55c89f5f28ab1f40e8b (1,075,223 bytes)

## hf_deepseek-v3.json / hf_deepseek-r1.json
- URLs: https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer.json (rev e815299b, sha256 621ac2e32d0dba658404412318818aaa8ce8cda492e59830109d8da6b517fb41); https://huggingface.co/deepseek-ai/DeepSeek-R1/resolve/main/tokenizer.json (rev 56d4cbbb, sha256 ecb6f9fc369894346f0511f4074ca75cee5cd5f3b06d02f1ba35fcd39f8e121d)
- License: DeepSeek-V3: code MIT, model under the DeepSeek Model License (commercial use allowed); DeepSeek-R1: MIT
- shipped sha256: V3 89518b5f935ef0f36ec07bb88ee2cded3b6da154bc88abfd3b4321e34e110698 (3,437,567 bytes); R1 a3fc6943c3c9859649f443f8c8757114abc596ef9be642dc00b6b82c7189c136 (41,632 bytes)

## hf_qwen2.5.json
- URL: https://huggingface.co/Qwen/Qwen2.5-7B/resolve/main/tokenizer.json (rev d1497293, sha256 c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539)
- License: Apache-2.0
- shipped sha256: dd8ec67c9287837ac88f00a602153fb4d2c98b0aec05a8a799afb8672a811345 (3,803,958 bytes)

## hf_phi-4.json
- URL: https://huggingface.co/microsoft/phi-4/resolve/main/tokenizer.json (rev 2db69c1c, sha256 9f38d05d9d25756bb2f181ab5a0cebcd59e638df10336fc7ed1010f7296d0298)
- License: MIT
- shipped sha256: 8fcb193248f37488b01a75b474a51b78d8aec622e9fdbd514ecea0f6e336123d (2,143,004 bytes)

## hf_gpt-neox-20b.json
- URL: https://huggingface.co/EleutherAI/gpt-neox-20b/resolve/main/tokenizer.json (rev c292233c, sha256 c24618a1b3e6a38167beff1c72cffd126c3a66254347304b50547d12c5f25624)
- License: Apache-2.0
- shipped sha256: 4459562be7a8a0d9abf35dc5fde860f0d54feb1bf10486e8caf77245dbd17f5d (1,066,552 bytes)

## hf_starcoder2.json
- URL: https://huggingface.co/bigcode/starcoder2-3b/resolve/main/tokenizer.json (rev 733247c5, sha256 6190a6649d90a7fe35bfed8bff990c3e7aafc3cfa5beea185045f03f0890402b)
- License: BigCode OpenRAIL-M (use-based restrictions apply to the model; the tokenizer vocabulary is data)
- shipped sha256: 998c28f87dfb5516559d90ab65b990da35ba1b7b6c032758d89ccdfe6aaf55d7 (1,035,023 bytes)

## hf_mistral-7b-v0.3.json
- URL: https://huggingface.co/mistralai/Mistral-7B-v0.3/resolve/main/tokenizer.json (rev caa1feb0, sha256 e553af6fff7d7ad76e830608b218c5c0b0822998d5a1a96099a74cd3c1cb1a49; identical file to Mistral-7B-Instruct-v0.3)
- License: Apache-2.0
- shipped sha256: 56a8195ebea5f664926696e302677f28f607c089b415b35d9ba951ed69c37a8d (976,768 bytes)

## eng.traineddata
- URL: https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata (original 4,113,088 bytes, sha256 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2)
- License: Apache-2.0 (tessdata_fast, Tesseract OCR project)
- Used only by `src/tools/ocr.js`, which implements the LSTM inference itself (no Tesseract code or library).
- Shipped file is the same container repacked to keep only the components the engine reads (17 lstm, 21 lstm-unicharset, 22 lstm-recoder, 23 version; the dictionary/DAWG components are dropped). Component bytes are unmodified. Same 24-entry header layout, so it is still a valid traineddata file.
- shipped sha256: b2111851cd6036f42297df1f1ddf946985f8656a73600f3b92411c32f691cab0 (409,234 bytes)
- Reproduce: read int32 n (=24) and n int64 offsets from the original, slice each component up to the next larger offset, write int32 n + new offsets table + components 17, 21, 22, 23 back to back (offset -1 for all other entries).

## sentiment-distilbert-sst2.bin + sentiment-vocab.txt (src/tools/sentiment.js, tool ai-sentiment-classifier)
- Model: distilbert/distilbert-base-uncased-finetuned-sst-2-english at revision 714eb0fa89d2f80546fda750413ed43d93601a13 (DistilBERT fine-tuned on SST-2; trained from Hugging Face distilbert-base-uncased)
- URL: https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english/resolve/714eb0fa89d2f80546fda750413ed43d93601a13/model.safetensors
- License: Apache-2.0 (model card metadata `license: apache-2.0`; redistribution and modification permitted)
- Original model.safetensors sha256 7c3919835e442510166d267fe7cbe847e0c51cd26d9ba07b89a57b952b49b8aa (267,832,558 bytes), equal to the lfs sha256 published by the Hugging Face API (/api/models/<id>/tree/main).
- vocab.txt (shipped unchanged as sentiment-vocab.txt): sha256 07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3 (231,508 bytes); its git blob sha1 fb140275c155a9c7c5a3b3e0e77a9e839594a938 equals the oid published by the HF API.
- sentiment-distilbert-sst2.bin is a DERIVED file: all 2-D weight matrices (embeddings, attention, FFN, pre_classifier) quantised to int8 with one fp16 scale per 64 inputs; biases, LayerNorm and the 2x768 classifier kept float32. Container format and reproduction: scripts/pack-sentiment.py (python3 -I scripts/pack-sentiment.py model.safetensors data/sentiment-distilbert-sst2.bin).
- shipped sha256: 42d41ff4659fe60977e1920fa7a90d27d0c59c94a2f6f508749a96d74ac134fa (69,246,120 bytes)
- Verification (test/sentiment.mjs, fixtures test/fixtures/sentiment-oracle.json made with PyTorch 2.14 / transformers 5.20): on 30 varied sentences (incl. empty, emoji, CJK, accents, >256 tokens) the JS token ids are identical to transformers' tokenizer, and the JS logits match the HF model loaded with the dequantised weights (loaded by an independent Python parser of the .bin) to 5e-6. Quantisation error vs the original float32 model: max 0.26 / mean 0.02 in logit units (logits are about +-9); 2 of 30 labels differ, both near-50/50 texts (fp32 margin < 0.1).
