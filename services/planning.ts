export function calculateSceneCount(
  targetDurationSec: number,
  targetSceneDurationSec: number = 8
): number {
  return Math.ceil(targetDurationSec / targetSceneDurationSec);
}

export function calculateEstimatedDuration(
  text: string,
  language: string
): number {
  if (language.startsWith('zh')) {
    const charCount = text.replace(/\s/g, '').length;
    return charCount * 0.3;
  }
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount / 2.5;
}

export function validateDurationBounds(
  totalEstimatedSec: number,
  targetSec: number
): boolean {
  const tolerance = targetSec * 0.05;
  return Math.abs(totalEstimatedSec - targetSec) <= tolerance;
}

export function getDurationOptions(): Array<{ value: number; label: string; sceneCount: number }> {
  return [
    { value: 60, label: '1 minute (~8 scenes)', sceneCount: calculateSceneCount(60) },
    { value: 120, label: '2 minutes (~15 scenes)', sceneCount: calculateSceneCount(120) },
    { value: 180, label: '3 minutes (~23 scenes)', sceneCount: calculateSceneCount(180) },
  ];
}
