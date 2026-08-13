import type { Form } from "@protoform/core";

/**
 * Job Application — 4-step form modeled after a realistic
 * hiring flow.
 *
 * Steps:
 *  1. About You (name, contact details)
 *  2. Experience (role history, employment type)
 *  3. Documents (resume upload, cover letter)
 *  4. Review & Declarations
 */
export const jobApplicationSchema: Form = {
  fields: [
    // ── Step 1: About You ─────────────────────────────────
    { id: "first_name", meta: { type: "text", label: "First name", required: true, properties: { placeholder: "First name" } } },
    { id: "last_name", meta: { type: "text", label: "Last name", required: true, properties: { placeholder: "Last name" } } },
    { id: "email", meta: { type: "email", label: "Email address", required: true, properties: { placeholder: "you@example.com" } } },
    { id: "phone", meta: { type: "text", label: "Phone number", required: true, properties: { placeholder: "+1 555 000 0000" } } },

    // ── Step 2: Experience ────────────────────────────────
    { id: "current_role", meta: { type: "text", label: "Current or most recent role", required: true, properties: { placeholder: "e.g. Product Designer" } } },
    { id: "years_experience", meta: { type: "number", label: "Years of professional experience", required: true, properties: { placeholder: "e.g. 4", min: 0, max: 60, step: 1 } } },
    { id: "previous_role", meta: { type: "text", label: "Previous role", properties: { placeholder: "e.g. Design Intern" } } },
    { id: "previous_employer", meta: { type: "text", label: "Previous employer", properties: { placeholder: "Company or organization" } } },
    { id: "employment_type", meta: { type: "select", label: "Current employment type", required: true, properties: { options: [
      { label: "Full time", value: "full_time" },
      { label: "Part time", value: "part_time" },
      { label: "Contract", value: "contract" },
      { label: "Freelance", value: "freelance" },
      { label: "Student", value: "student" },
      { label: "Between roles", value: "between_roles" },
      { label: "Other", value: "other" },
    ] } } },
    { id: "employment_type_other", meta: { type: "text", label: "Please describe", properties: { placeholder: "Describe your current situation" } } },
    { id: "notice_period", meta: { type: "select", label: "Notice period", properties: { options: [
      { label: "Available immediately", value: "immediate" },
      { label: "2 weeks", value: "two_weeks" },
      { label: "1 month", value: "one_month" },
      { label: "3 months", value: "three_months" },
    ] } } },

    // ── Step 3: Documents ─────────────────────────────────
    { id: "resume", meta: { type: "file", label: "Resume / CV", required: true, properties: { accept: ".pdf,.doc,.docx" } } },
    { id: "cover_letter", meta: { type: "textarea", label: "Cover letter", properties: { placeholder: "Tell us why you're a great fit (optional)..." } } },
    { id: "portfolio_url", meta: { type: "text", label: "Portfolio or website", properties: { placeholder: "https://your-site.example" } } },

    // ── Step 4: Review & Declarations ─────────────────────
    { id: "declaration_truthful", meta: { type: "checkbox", label: "I confirm that the information provided in this application is true and complete." } },
    { id: "declaration_privacy", meta: { type: "checkbox", label: "I consent to my details being stored and processed for recruitment purposes." } },
    { id: "declaration_updates", meta: { type: "checkbox", label: "Keep my profile on file for future openings." } },
  ],

  layout: [
    // ── Step 1 ──
    {
      id: "about_you",
      meta: { title: "About You", sub_title: "Tell us who you are" },
      children: [{ id: "first_name" }, { id: "last_name" }, { id: "email" }, { id: "phone" }],
      layout: [["first_name", "last_name"], ["email", "phone"]],
    },

    // ── Step 2 ──
    {
      id: "experience",
      meta: { title: "Experience", sub_title: "Your work history" },
      children: [
        { id: "current_role" },
        { id: "years_experience" },
        { id: "previous_role" },
        { id: "previous_employer" },
        { id: "employment_type" },
        { id: "employment_type_other" },
        { id: "notice_period" },
      ],
      layout: [
        ["current_role", "years_experience"],
        ["previous_role", "previous_employer"],
        ["employment_type"],
        ["employment_type_other"],
        ["notice_period"],
      ],
    },

    // ── Step 3 ──
    {
      id: "documents",
      meta: { title: "Documents", sub_title: "Your resume and supporting material" },
      children: [{ id: "resume" }, { id: "cover_letter" }, { id: "portfolio_url" }],
      layout: [["resume"], ["cover_letter"], ["portfolio_url"]],
    },

    // ── Step 4 ──
    {
      id: "review_declarations",
      meta: { title: "Review & Declarations", sub_title: "Almost there" },
      children: [{ id: "declaration_truthful" }, { id: "declaration_privacy" }, { id: "declaration_updates" }],
    },
  ],

  rules: [
    // ── About You ──
    // Name length checks (templates auto-infer the fieldId from the rule's target)
    { id: "first_name_len", when: { type: "and", expressions: ["isNotEmpty", "minLength(2)"] }, affects: [{ target: "first_name", valid: false, blocking: true, message: "Must be at least 2 characters", type: "error" }] },
    { id: "last_name_len", when: { type: "and", expressions: ["isNotEmpty", "minLength(2)"] }, affects: [{ target: "last_name", valid: false, blocking: true, message: "Must be at least 2 characters", type: "error" }] },
    { id: "email_format", when: "value('email') !== null && value('email') !== '' && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value('email'))", affects: [{ target: "email", valid: false, blocking: true, message: "Please enter a valid email address", type: "error" }] },
    { id: "phone_no_letters", when: "matches('[A-Za-z]')", affects: [{ target: "phone", valid: false, blocking: true, message: "Phone numbers cannot contain letters", type: "error" }] },

    // ── Experience ──
    { id: "years_min", when: "minValue(0)", affects: [{ target: "years_experience", valid: false, blocking: true, message: "Years of experience cannot be negative", type: "error" }] },
    { id: "years_sanity", when: "maxValue(60)", affects: [{ target: "years_experience", valid: false, blocking: true, message: "Please double-check this number", type: "error" }] },
    // Applicants with under 2 years of experience must list a previous role
    { id: "show_previous", when: "value('years_experience') !== null && value('years_experience') < 2",
      affects: [
        { target: "previous_role", visible: true, required: true },
        { target: "previous_employer", visible: true },
      ],
    },
    { id: "hide_previous", when: "value('years_experience') === null || value('years_experience') >= 2",
      affects: [
        { target: "previous_role", visible: false },
        { target: "previous_employer", visible: false },
      ],
    },
    // Chained rule: only applies while show_previous is active
    { id: "previous_role_differs", when: { type: "and", expressions: ["isNotEmpty", "fieldsEqual(previous_role, current_role)"] }, required_parent: ["show_previous"], affects: [{ target: "previous_role", valid: false, blocking: true, message: "Your previous role should be different from your current role", type: "error" }] },
    // Employment type reveals
    { id: "show_type_other", when: "fieldEquals(employment_type, other)", affects: [{ target: "employment_type_other", visible: true, required: true }] },
    { id: "hide_type_other", when: "fieldNotEquals(employment_type, other)", affects: [{ target: "employment_type_other", visible: false }] },
    { id: "type_other_len", when: { type: "and", expressions: ["isNotEmpty", "minLength(3)"] }, required_parent: ["show_type_other"], affects: [{ target: "employment_type_other", valid: false, blocking: true, message: "Please describe in at least 3 characters", type: "error" }] },
    { id: "show_notice", when: "value('employment_type') === 'full_time' || value('employment_type') === 'part_time' || value('employment_type') === 'contract'", affects: [{ target: "notice_period", visible: true, required: true }] },
    { id: "hide_notice", when: "value('employment_type') !== 'full_time' && value('employment_type') !== 'part_time' && value('employment_type') !== 'contract'", affects: [{ target: "notice_period", visible: false }] },

    // ── Documents ──
    { id: "cover_letter_started", when: "isNotEmpty", affects: [{ target: "cover_letter", message: "A tailored cover letter helps your application stand out", type: "info" }] },
    { id: "cover_letter_min", when: "minLength(50)", required_parent: ["cover_letter_started"], affects: [{ target: "cover_letter", valid: false, blocking: true, message: "Cover letters should be at least 50 characters — or leave it blank", type: "error" }] },
    { id: "portfolio_no_spaces", when: "matches(' ')", affects: [{ target: "portfolio_url", valid: false, blocking: true, message: "Web addresses cannot contain spaces", type: "error" }] },

    // ── Review & Declarations ──
    // Both declarations are required and blocking
    { id: "require_truthful", when: "true", affects: [{ target: "declaration_truthful", required: true }] },
    { id: "require_privacy", when: "true", affects: [{ target: "declaration_privacy", required: true }] },
    { id: "block_truthful", when: "value('declaration_truthful') !== true", affects: [{ target: "declaration_truthful", valid: false, blocking: true, message: "You must confirm your information is accurate to submit", type: "error" }] },
    { id: "block_privacy", when: "value('declaration_privacy') !== true", affects: [{ target: "declaration_privacy", valid: false, blocking: true, message: "You must consent to your details being processed to submit", type: "error" }] },
  ],
};
