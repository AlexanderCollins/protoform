import type { Form, Field } from "@protoform/core";

const fields: Field[] = [
  { id: "first_name", meta: { type: "text", label: "First Name", required: true, properties: { placeholder: "Enter your first name" } } },
  { id: "last_name", meta: { type: "text", label: "Last Name", required: true, properties: { placeholder: "Enter your last name" } } },
  { id: "date_of_birth", meta: { type: "date", label: "Date of Birth", required: true } },
  { id: "gender", meta: { type: "select", label: "Gender", properties: { options: [{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }, { value: "prefer_not_to_say", label: "Prefer not to say" }] } } },
  { id: "email", meta: { type: "email", label: "Email Address", required: true, properties: { placeholder: "your.email@example.com" } } },
  { id: "phone", meta: { type: "text", label: "Phone Number", required: true, properties: { placeholder: "+1 (555) 000-0000" } } },
  { id: "address_line1", meta: { type: "text", label: "Address Line 1", required: true, properties: { placeholder: "Street address" } } },
  { id: "address_line2", meta: { type: "text", label: "Address Line 2", properties: { placeholder: "Apartment, suite, etc. (optional)" } } },
  { id: "city", meta: { type: "text", label: "City", required: true, properties: { placeholder: "Enter city" } } },
  { id: "state", meta: { type: "text", label: "State/Province", required: true, properties: { placeholder: "Enter state or province" } } },
  { id: "postal_code", meta: { type: "text", label: "Postal Code", required: true, properties: { placeholder: "Enter postal code" } } },
  { id: "country", meta: { type: "select", label: "Country", required: true, properties: { options: [{ value: "US", label: "United States" }, { value: "CA", label: "Canada" }, { value: "GB", label: "United Kingdom" }, { value: "AU", label: "Australia" }, { value: "NZ", label: "New Zealand" }] } } },
  { id: "attendance_type", meta: { type: "select", label: "How will you attend?", required: true, properties: { options: [{ value: "in_person", label: "In person" }, { value: "virtual", label: "Virtual" }, { value: "exhibitor", label: "Exhibitor" }, { value: "press", label: "Press / Media" }, { value: "student", label: "Student" }] } } },
  { id: "organization", meta: { type: "text", label: "Organization", properties: { placeholder: "Enter organization name" } } },
  { id: "session_track", meta: { type: "text", label: "Session Track Preference", properties: { placeholder: "e.g. Design, Engineering, Community" } } },
  { id: "group_size", meta: { type: "number", label: "Number of Attendees in Your Group", properties: { placeholder: "Enter group size", min: 1 } } },
  { id: "hear_about_us", meta: { type: "select", label: "How did you hear about us?", required: true, properties: { options: [{ value: "search_engine", label: "Search Engine" }, { value: "social_media", label: "Social Media" }, { value: "friend_referral", label: "Friend or Colleague" }, { value: "advertisement", label: "Advertisement" }, { value: "other", label: "Other" }] } } },
  { id: "additional_comments", meta: { type: "textarea", label: "Additional Comments", properties: { placeholder: "Any additional information you'd like to share..." } } },
  { id: "agree_terms", meta: { type: "checkbox", label: "I agree to the terms and conditions", required: true } },
  { id: "marketing_consent", meta: { type: "checkbox", label: "I'd like to receive event updates and announcements" } },
];

const findField = (id: string): Field => fields.find((f) => f.id === id)!;

export const multiStepFormSchema: Form = {
  fields,
  layout: [
    {
      id: "step_personal", meta: { title: "Personal Information", sub_title: "Tell us about yourself", type: "step" },
      children: [findField("first_name"), findField("last_name"), findField("date_of_birth"), findField("gender")],
      layout: [["first_name", "last_name"], ["date_of_birth", "gender"]],
    },
    {
      id: "step_contact", meta: { title: "Contact Details", sub_title: "How can we reach you?", type: "step" },
      children: [findField("email"), findField("phone"), findField("address_line1"), findField("address_line2"), findField("city"), findField("state"), findField("postal_code"), findField("country")],
      layout: [["email", "phone"], ["address_line1"], ["address_line2"], ["city", "state"], ["postal_code", "country"]],
    },
    {
      id: "step_attendance", meta: { title: "Attendance Details", sub_title: "Tell us how you'll join the event", type: "step" },
      children: [findField("attendance_type"), findField("organization"), findField("session_track"), findField("group_size")],
      layout: [["attendance_type"], ["organization", "session_track"], ["group_size"]],
    },
    {
      id: "step_additional", meta: { title: "Additional Information", sub_title: "Just a few more details", type: "step" },
      children: [findField("hear_about_us"), findField("additional_comments"), findField("agree_terms"), findField("marketing_consent")],
      layout: [["hear_about_us"], ["additional_comments"], ["agree_terms"], ["marketing_consent"]],
    },
  ],
  rules: [
    { id: "rule_hide_attendance_fields", when: { type: "and", expressions: ["fieldNotEquals(attendance_type, in_person)", "fieldNotEquals(attendance_type, exhibitor)"] }, affects: [{ target: "organization", visible: false }, { target: "session_track", visible: false }, { target: "group_size", visible: false }] },
    { id: "rule_require_attendance_fields_in_person", when: "fieldEquals(attendance_type, in_person)", affects: [{ target: "organization", required: true }, { target: "session_track", required: true }, { target: "group_size", required: true }] },
    { id: "rule_require_attendance_fields_exhibitor", when: "fieldEquals(attendance_type, exhibitor)", affects: [{ target: "group_size", required: true }] },
    { id: "rule_email_format", when: { expressions: "value('email') !== null && value('email') !== '' && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value('email'))" }, affects: [{ target: "email", valid: false, blocking: true, message: "Please enter a valid email address", type: "error" }] },
    { id: "rule_terms_required", when: "value('agree_terms') !== true", affects: [{ target: "agree_terms", valid: false, blocking: true, message: "You must agree to the terms and conditions to proceed", type: "error" }] },
  ],
};
