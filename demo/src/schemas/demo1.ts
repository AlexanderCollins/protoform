import type { Form, Field } from "@protoform/core";

const fields: Field[] = [
  {
    id: "first_name",
    meta: { type: "text", label: "First Name", required: true, properties: { placeholder: "Enter your first name" } },
  },
  {
    id: "last_name",
    meta: { type: "text", label: "Last Name", required: true, properties: { placeholder: "Enter your last name" } },
  },
  {
    id: "age",
    meta: { type: "number", label: "Age", required: true, properties: { placeholder: "Enter your age", min: 0, max: 120 } },
  },
  {
    id: "country",
    meta: {
      type: "select", label: "Country", required: true,
      properties: {
        options: [
          { value: "US", label: "United States" },
          { value: "AU", label: "Australia" },
          { value: "UK", label: "United Kingdom" },
          { value: "CA", label: "Canada" },
        ],
      },
    },
  },
  {
    id: "has_referral",
    meta: { type: "checkbox", label: "I have a referral code" },
  },
  {
    id: "referral_code",
    meta: {
      type: "text", label: "Referral Code",
      description: "Three letters, a dash, four digits — try PFX-3400",
      properties: { placeholder: "PFX-3400", maxLength: 8 },
    },
  },
  {
    id: "membership_plan",
    meta: {
      type: "select", label: "Plan", required: true,
      properties: {
        options: [
          { value: "free", label: "Free" },
          { value: "personal", label: "Personal" },
          { value: "team", label: "Team" },
        ],
      },
    },
  },
  {
    id: "team_size",
    meta: { type: "number", label: "Team Size", properties: { placeholder: "How many people are on your team?", min: 1 } },
  },
];

const findField = (id: string): Field => fields.find((f) => f.id === id)!;

export const demoFormSchema: Form = {
  fields,
  layout: [
    {
      id: "section_about",
      meta: { title: "Your Details", sub_title: "Tell us about yourself", type: "section" },
      children: [findField("first_name"), findField("last_name"), findField("age"), findField("country"), findField("has_referral"), findField("referral_code")],
      layout: [["first_name", "last_name"], ["age", "country"], ["has_referral"], ["referral_code"]],
    },
    {
      id: "section_plan",
      meta: { title: "Choose a Plan", sub_title: "Pick the plan that fits you best", type: "section" },
      children: [findField("membership_plan"), findField("team_size")],
      layout: [["membership_plan"], ["team_size"]],
    },
  ],
  rules: [
    { id: "rule_age_minimum", when: "minValue(18)", affects: [{ target: "age", valid: false, blocking: true, message: "You must be at least 18 years old to register.", type: "error" }] },
    { id: "rule_hide_referral", when: "value('has_referral') !== true", affects: [{ target: "referral_code", visible: false }] },
    { id: "rule_show_referral", when: "value('has_referral') === true", affects: [{ target: "referral_code", visible: true }] },
    { id: "rule_require_referral", when: "isNotEmpty", required_parent: ["rule_show_referral"], affects: [{ target: "referral_code", required: true }] },
    { id: "rule_validate_referral", when: "referralInvalid", required_parent: ["rule_show_referral"], affects: [{ target: "referral_code", valid: false, blocking: true, message: "Invalid referral code. Codes look like PFX-3400 — three letters, four digits, checksum divisible by 7.", type: "error" }] },
    { id: "rule_team_size_visibility", when: "fieldNotEquals(membership_plan, team)", affects: [{ target: "team_size", visible: false }] },
    { id: "rule_team_size_show", when: "fieldEquals(membership_plan, team)", affects: [{ target: "team_size", visible: true }] },
    { id: "rule_team_size_required", when: { type: "and", expressions: ["value('membership_plan') === 'team'", "value('membership_plan') !== null", "value('membership_plan') !== ''"] }, affects: [{ target: "team_size", required: true }] },
    { id: "rule_large_team", when: "maxValue(500)", affects: [{ target: "team_size", message: "That's a big team! Our onboarding crew will reach out to help you get set up.", type: "info" }] },
    { id: "rule_small_team", when: { type: "and", expressions: ["value('team_size') < 2", "value('team_size') > 0", "value('membership_plan') === 'team'"] }, affects: [{ target: "team_size", message: "Team plans are designed for 2 or more people. The Personal plan may suit you better.", type: "info" }] },
  ],
};
