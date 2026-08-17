export type LocalSettleCandidate = {
  distance: number;
  story: number;
  target: number;
};

export function selectLocalSettleCandidate(
  targets: readonly number[],
  releaseY: number,
  captureDistance: number,
): LocalSettleCandidate | null {
  let candidate: LocalSettleCandidate | null = null;

  targets.forEach((target, index) => {
    const distance = Math.abs(target - releaseY);
    if (distance > captureDistance) return;
    if (candidate && candidate.distance <= distance) return;

    candidate = {
      distance,
      story: index + 1,
      target,
    };
  });

  return candidate;
}
