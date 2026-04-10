import { NAME, pattern, UI } from "commonfabric";
import SpaceSetup from "./space-setup.tsx";
import { DEMO_PERSON_NOTES, DEMO_RECIPE_NOTES } from "./demo-constants.ts";

export default pattern(() => {
  // Construction lives inside the pattern body because the new SES verifier
  // rejects template-literal interpolation of imported values at module scope
  // ("Top-level value is not allowed in SES mode").
  const DEMO_INSTRUCTIONS = `Create a Charm Creator instance first.

Then create three Person charms:

1. First person (for live extraction demo):
   - Leave all fields empty
   - Only populate the notes field with:
   "${DEMO_PERSON_NOTES}"

2. Second person (pre-filled data for meta-analyzer):
   - displayName: "Alex Kim"
   - givenName: "Alex"
   - familyName: "Kim"
   - birthday: "1992-07-20"
   - notes: "Machine learning engineer at DataCorp. Specializes in computer vision and deep learning. Marathon runner. Based in Seattle. Graduated from Stanford in 2014. Speaks Korean and English. Loves comfort food, especially mac and cheese."

3. Third person (pre-filled data for meta-analyzer):
   - displayName: "Jordan Taylor"
   - givenName: "Jordan"
   - familyName: "Taylor"
   - birthday: "1990-03-15"
   - notes: "Full-stack developer at CloudStart. Specializes in distributed systems and microservices. Plays guitar in a band. Based in Austin. Graduated from UC Berkeley in 2012. Vegetarian."

Then create a Food Recipe charm with only the notes field populated:
"${DEMO_RECIPE_NOTES}"

Use the exact content and structure provided.`;

  // Wrap the child pattern as a JSX element so its [NAME] / [UI] flow through
  // this pattern's output. Returning `SpaceSetup({...})` directly used to work
  // in the old framework but now yields an OpaqueRef the shell can't render.
  // See labs/packages/patterns/counter/counter.tsx (_CounterView) for the
  // canonical "pattern as JSX element" wrapper idiom.
  return {
    [NAME]: "Space Setup (Demo)",
    [UI]: <SpaceSetup instructions={DEMO_INSTRUCTIONS} />,
  };
});
