import { AppLocale } from '../../core/i18n/locale.service';
import { translate } from '../../core/i18n/translations';

const optionKeys = {
  "Grandparent": "essentials.option.Grandparent",
  "Aunt": "essentials.option.Aunt",
  "Uncle": "essentials.option.Uncle",
  "Sibling": "essentials.option.Sibling",
  "Other relative": "essentials.option.Other relative",
  "Family friend": "essentials.option.Family friend",
  "Neighbor": "essentials.option.Neighbor",
  "Other": "essentials.option.Other",
  "Doctor": "essentials.option.Doctor",
  "Dentist": "essentials.option.Dentist",
  "Optometrist": "essentials.option.Optometrist",
  "Pre-K": "essentials.option.Pre-K",
  "Kindergarten": "essentials.option.Kindergarten"
} as const;

export function essentialsOption(value: string, locale: AppLocale): string {
  const key = optionKeys[value as keyof typeof optionKeys];
  return key ? translate(key, locale) : value;
}
