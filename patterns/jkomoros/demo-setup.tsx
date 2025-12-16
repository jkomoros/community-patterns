/// <cts-enable />
import { pattern } from "commontools";
import SpaceSetup from "./space-setup.tsx";
import { DEMO_PERSON_NOTES, DEMO_RECIPE_NOTES } from "./demo-constants.ts";

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

export default pattern(() => {
  return SpaceSetup({
    instructions: DEMO_INSTRUCTIONS,
  });
});
