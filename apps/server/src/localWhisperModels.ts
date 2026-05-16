import type { LocalWhisperModel } from "@t3tools/contracts";

export interface WhisperModelDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly language: LocalWhisperModel["language"];
  readonly diskBytes: number;
  readonly sha1: string | null;
  readonly quantization: LocalWhisperModel["quantization"];
  readonly recommended: boolean;
  readonly url: string;
}

const WHISPER_CPP_MODEL_BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const TINY_DIARIZE_MODEL_BASE_URL =
  "https://huggingface.co/akashmjn/tinydiarize-whisper.cpp/resolve/main";

const modelUrl = (id: string): string => `${WHISPER_CPP_MODEL_BASE_URL}/ggml-${id}.bin`;
const diarizeModelUrl = (id: string): string => `${TINY_DIARIZE_MODEL_BASE_URL}/ggml-${id}.bin`;

function inferLanguage(id: string): LocalWhisperModel["language"] {
  return id.includes(".en") ? "english" : "multilingual";
}

function inferQuantization(id: string): LocalWhisperModel["quantization"] {
  if (id.includes("-q5_")) {
    return "Q5";
  }
  if (id.includes("-q8_")) {
    return "Q8";
  }
  return null;
}

function defineModel(input: {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly diskBytes: number;
  readonly language?: LocalWhisperModel["language"];
  readonly sha1?: string;
  readonly quantization?: LocalWhisperModel["quantization"];
  readonly recommended?: boolean;
  readonly url?: string;
}): WhisperModelDefinition {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    language: input.language ?? inferLanguage(input.id),
    diskBytes: input.diskBytes,
    sha1: input.sha1 ?? null,
    quantization: input.quantization ?? inferQuantization(input.id),
    recommended: input.recommended ?? false,
    url: input.url ?? modelUrl(input.id),
  };
}

export const WHISPER_MODELS: readonly WhisperModelDefinition[] = [
  defineModel({
    id: "tiny",
    name: "Tiny",
    description: "Smallest multilingual model. Fastest startup, lowest accuracy.",
    diskBytes: 77_691_713,
    sha1: "bd577a113a864445d4c299885e0cb97d4ba92b5f",
  }),
  defineModel({
    id: "tiny.en",
    name: "Tiny English",
    description: "Smallest English-only model. Good for very short prompts on slow machines.",
    diskBytes: 77_704_715,
    sha1: "c78c86eb1a8faa21b369bcd33207cc90d64ae9df",
  }),
  defineModel({
    id: "tiny-q5_1",
    name: "Tiny Q5",
    description: "Smallest quantized multilingual model. Lowest storage, weakest accuracy.",
    diskBytes: 32_152_673,
  }),
  defineModel({
    id: "tiny.en-q5_1",
    name: "Tiny English Q5",
    description: "Smallest quantized English model. Minimal download for quick dictation trials.",
    diskBytes: 32_166_155,
  }),
  defineModel({
    id: "tiny-q8_0",
    name: "Tiny Q8",
    description: "Tiny multilingual Q8 model. Small download with less quantization loss than Q5.",
    diskBytes: 43_537_433,
  }),
  defineModel({
    id: "tiny.en-q8_0",
    name: "Tiny English Q8",
    description: "Tiny English Q8 model. Compact storage with a modest quality tradeoff.",
    diskBytes: 43_550_795,
  }),
  defineModel({
    id: "base",
    name: "Base",
    description: "Light multilingual model. Balanced for quick local prompt dictation.",
    diskBytes: 147_951_465,
    sha1: "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
  }),
  defineModel({
    id: "base.en",
    name: "Base English",
    description: "Light English-only model. Recommended first download for coding prompts.",
    diskBytes: 147_964_211,
    sha1: "137c40403d78fd54d454da0f9bd998f78703390c",
    recommended: true,
  }),
  defineModel({
    id: "base-q5_1",
    name: "Base Q5",
    description: "Quantized base multilingual model. Good storage savings for casual dictation.",
    diskBytes: 59_707_625,
  }),
  defineModel({
    id: "base.en-q5_1",
    name: "Base English Q5",
    description: "Quantized base English model. Small download for English coding prompts.",
    diskBytes: 59_721_011,
  }),
  defineModel({
    id: "base-q8_0",
    name: "Base Q8",
    description: "Base multilingual Q8 model. Smaller than full precision with mild loss.",
    diskBytes: 81_768_585,
  }),
  defineModel({
    id: "base.en-q8_0",
    name: "Base English Q8",
    description: "Base English Q8 model. Compact English dictation with better retention than Q5.",
    diskBytes: 81_781_811,
  }),
  defineModel({
    id: "small",
    name: "Small",
    description: "Stronger multilingual accuracy with a moderate storage cost.",
    diskBytes: 487_601_967,
    sha1: "55356645c2b361a969dfd0ef2c5a50d530afd8d5",
  }),
  defineModel({
    id: "small.en",
    name: "Small English",
    description: "Stronger English-only accuracy for code, filenames, and technical prompts.",
    diskBytes: 487_614_201,
    sha1: "db8a495a91d927739e50b3fc1cc4c6b8f6c2d022",
  }),
  defineModel({
    id: "small.en-tdrz",
    name: "Small English Diarize",
    description: "English model with local speaker-turn markers. Usually unnecessary for prompts.",
    diskBytes: 487_614_184,
    sha1: "b6c6e7e89af1a35c08e6de56b66ca6a02a2fdfa1",
    url: diarizeModelUrl("small.en-tdrz"),
  }),
  defineModel({
    id: "small-q5_1",
    name: "Small Q5",
    description: "Quantized small multilingual model. Stronger than base with lower storage.",
    diskBytes: 190_085_487,
  }),
  defineModel({
    id: "small.en-q5_1",
    name: "Small English Q5",
    description:
      "Quantized small English model. Better English accuracy without a full small download.",
    diskBytes: 190_098_681,
  }),
  defineModel({
    id: "small-q8_0",
    name: "Small Q8",
    description: "Small multilingual Q8 model. Moderate storage with modest quantization loss.",
    diskBytes: 264_464_607,
  }),
  defineModel({
    id: "small.en-q8_0",
    name: "Small English Q8",
    description: "Small English Q8 model. Accurate English dictation at a reduced size.",
    diskBytes: 264_477_561,
  }),
  defineModel({
    id: "medium",
    name: "Medium",
    description: "High multilingual accuracy. Larger and slower on CPU-only systems.",
    diskBytes: 1_533_763_059,
    sha1: "fd9727b6e1217c2f614f9b698455c4ffd82463b4",
  }),
  defineModel({
    id: "medium.en",
    name: "Medium English",
    description: "High English-only accuracy with a large storage and CPU cost.",
    diskBytes: 1_533_774_781,
    sha1: "8c30f0e44ce9560643ebd10bbe50cd20eafd3723",
  }),
  defineModel({
    id: "medium-q5_0",
    name: "Medium Q5",
    description: "Quantized medium multilingual model. High accuracy with a much smaller file.",
    diskBytes: 539_212_467,
  }),
  defineModel({
    id: "medium.en-q5_0",
    name: "Medium English Q5",
    description: "Quantized medium English model. High English accuracy at a reduced size.",
    diskBytes: 539_225_533,
  }),
  defineModel({
    id: "medium-q8_0",
    name: "Medium Q8",
    description: "Medium multilingual Q8 model. Larger than Q5 with better quality retention.",
    diskBytes: 823_369_779,
  }),
  defineModel({
    id: "medium.en-q8_0",
    name: "Medium English Q8",
    description: "Medium English Q8 model. Strong English accuracy with reduced storage.",
    diskBytes: 823_382_461,
  }),
  defineModel({
    id: "large-v1",
    name: "Large v1",
    description: "Original large multilingual model. Best kept for compatibility comparisons.",
    diskBytes: 3_094_623_691,
    sha1: "b1caaf735c4cc1429223d5a74f0f4d0b9b59a299",
  }),
  defineModel({
    id: "large-v2",
    name: "Large v2",
    description: "Large multilingual model with strong accuracy and high resource use.",
    diskBytes: 3_094_623_691,
    sha1: "0f4c8e34f21cf1a914c59d8b3ce882345ad349d6",
  }),
  defineModel({
    id: "large-v2-q5_0",
    name: "Large v2 Q5",
    description: "Quantized large v2. Much smaller with some accuracy tradeoff.",
    diskBytes: 1_080_732_091,
    sha1: "00e39f2196344e901b3a2bd5814807a769bd1630",
  }),
  defineModel({
    id: "large-v2-q8_0",
    name: "Large v2 Q8",
    description: "Large v2 Q8 model. High accuracy with less storage than full large v2.",
    diskBytes: 1_656_129_691,
  }),
  defineModel({
    id: "large-v3",
    name: "Large v3",
    description: "Highest quality multilingual model. Heavy for prompt dictation.",
    diskBytes: 3_095_033_483,
    sha1: "ad82bf6a9043ceed055076d0fd39f5f186ff8062",
  }),
  defineModel({
    id: "large-v3-q5_0",
    name: "Large v3 Q5",
    description: "Quantized large v3. High quality with substantially lower storage.",
    diskBytes: 1_081_140_203,
    sha1: "e6e2ed78495d403bef4b7cff42ef4aaadcfea8de",
  }),
  defineModel({
    id: "large-v3-turbo",
    name: "Large v3 Turbo",
    description: "Fast large-class model. Strong accuracy, but still a large download.",
    diskBytes: 1_624_555_275,
    sha1: "4af2b29d7ec73d781377bfd1758ca957a807e941",
  }),
  defineModel({
    id: "large-v3-turbo-q5_0",
    name: "Large v3 Turbo Q5",
    description: "Quantized turbo model. Best high-quality storage tradeoff.",
    diskBytes: 574_041_195,
    sha1: "e050f7970618a659205450ad97eb95a18d69c9ee",
  }),
  defineModel({
    id: "large-v3-turbo-q8_0",
    name: "Large v3 Turbo Q8",
    description: "Turbo Q8 model. Higher quality retention than Q5 with a larger download.",
    diskBytes: 874_188_075,
  }),
];
