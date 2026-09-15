export const QUESTION_LABELS = {
  sad_or_upset: "Sad or upset",
  lonely: "Lonely",
  confident: "Low confidence",
  stressed_or_anxious: "Stressed or anxious",
  happy: "Low happiness",
  bad_tempered_or_angry: "Bad-tempered or angry",
  happiness_with_number_of_good_friends: "Unhappy with number of good friends",
  bullying_frequency: "Bullying frequency",
  school_belonging: "School belonging",
  school_helps_when_worried: "School helps when worried",
  enjoys_school: "Enjoys school",
  school_is_welcoming_and_caring: "School is welcoming and caring",
  relationship_with_school_staff: "Relationship with school staff",
  safety_school_toilets: "Safety in school toilets",
  safety_travelling_to_from_school: "Safety travelling to or from school",
  safety_during_lessons: "Safety during lessons",
  safety_outside_lessons: "Safety outside lessons",
  healthy_lifestyle_encouragement: "Healthy lifestyle encouragement"
} as const;

export type QuestionCode = keyof typeof QUESTION_LABELS;

export function questionLabel(code: string): string {
  return QUESTION_LABELS[code as QuestionCode] ?? code.replaceAll("_", " ");
}

export function displayLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
