# Builder dependency-aware plans

Customer Forge plans are ordered programs, not unordered bags of edits.

## Temporary references

A plan may create a page, section, or component and then immediately continue editing it:

```text
add_page          ref=temp_page_1
add_section       pageId=temp_page_1 ref=temp_section_1
set_section_text  sectionId=temp_section_1
add_component     sectionId=temp_section_1 ref=temp_component_1
set_component     componentId=temp_component_1
set_component_visual componentId=temp_component_1
```

Temporary references are valid only after the action that creates them. Page, section, and component references use separate namespaces.

## Why this matters

The builder can now complete a new structure in one approved plan instead of forcing a second request merely to refine an object that was created moments earlier. This makes large natural-language requests behave more like a single coherent build.

The executor resolves temporary references to real database IDs immediately after creation. Component sort order is tracked during the same run from the current maximum slot, so multiple new components cannot collapse onto one sort position.

## Safety

The dependency guards remain fail-closed:

- unknown references are rejected;
- references used before their creator are rejected;
- duplicate temporary references are rejected;
- duplicate page slugs are rejected before execution;
- real IDs remain scoped to the current workspace;
- writes still use the authenticated RLS path;
- every approved apply still gets a restore point, atomic undo, and post-apply verification.

The finite visual vocabulary remains authoritative. This feature does not add arbitrary CSS, JavaScript, SQL, credentials, or network access.

## Evidence boundary

Deterministic planning can prove the dependency structure and action validity. Browser behavior, database isolation, provider availability, and production infrastructure remain runtime/environment evidence and are never claimed from static planning alone.
