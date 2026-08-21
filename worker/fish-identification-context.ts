/**
 * Compact, versioned visual-identification context shared by the current
 * photo provider and future fish-image providers. Keep this as paraphrased
 * diagnostic guidance, not copied source text or a user-supplied prompt.
 *
 * Sources (accessed 2026-08-21):
 * - https://wildlife.ca.gov/Conservation/Marine/Nearshore/1000
 * - https://wildlife.ca.gov/Conservation/Marine/Surf
 * - https://wildlife.ca.gov/Fishing/Inland/Striped-Bass
 * - https://www.fws.gov/species/striped-bass-morone-saxatilis
 * - https://fishbase.se/summary/Triakis-semifasciata.html
 */

export const FISH_IDENTIFICATION_CONTEXT_VERSION = "castingcompass.fish-id-context/2026-08-21.1";

export const FISH_IDENTIFICATION_CONTEXT = [
  `Context version: ${FISH_IDENTIFICATION_CONTEXT_VERSION}.`,
  "Scope is limited to visible fish in California nearshore/surf images. Use only these ids: california-halibut, surfperch, striped-bass, leopard-shark, other, no-fish.",
  "Evidence rule: image anatomy and markings outrank location, date, gear, or the expected catch. Use habitat only as a weak tie-breaker after visible evidence. If the view is partial, blurred, occluded, a juvenile, or the diagnostic marks are absent, choose other with low confidence rather than guessing.",
  "california-halibut (Paralichthys californicus): a flatfish with both eyes on one side (either left or right); eyed side commonly brown to brown-black or mottled, blind side mostly white; strongly arched lateral line above the pectoral fin; large mouth with conical teeth and upper jaw extending behind the eye. Do not call Pacific halibut from a generic flatfish photo: California halibut can be either eye-side and have a more rearward-reaching jaw. Fin-ray counts are not expected from ordinary angler photos.",
  "surfperch (Embiotocidae family label): a small compressed oval/oblong fish, usually silvery, with a continuous un-notched dorsal fin, forked tail, and sometimes bars or stripes. Color and barring vary by species, age, and breeding condition; family-level surfperch is safer than inventing barred, redtail, calico, or another member from one photo. A fish that is not clearly this family should be other.",
  "striped-bass (Morone saxatilis): streamlined/fusiform silvery body, darker olive back and pale belly, usually seven or eight uninterrupted dark horizontal stripes on each side, two separate dorsal fins (the first spiny), and a forked tail. Require the horizontal stripe pattern plus the bass-like silhouette when visible; do not confuse vertical bars, reflections, or other striped fish with a striper.",
  "leopard-shark (Triakis semifasciata): elongated slender shark silhouette with a short narrow head, gray-to-light underside, and distinctive dark saddle-like bands interspersed with dark spots along the back/sides; two dorsal fins and a shark tail. Require both a shark body plan and the saddle/spot pattern when visible. Do not infer this label from spots alone; consider other shark or other when the pattern or fins are hidden.",
  "other: a visible fish that does not fit the four supported labels, a non-fish object, or an image too ambiguous for a supported label. no-fish: no fish is visibly present. Count conservatively, do not double-count the same fish within one image, and never infer legal size, species legality, or release/keep status from appearance.",
  "Return the requested JSON schema only. Confidence describes visual identification quality, not legal certainty or truthfulness. A note may briefly state the missing/visible cue, but must not claim a regulatory determination.",
].join("\n");
