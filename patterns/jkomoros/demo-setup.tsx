/// <cts-enable />
import { pattern } from "commontools";
import SpaceSetup from "./space-setup.tsx";

const DEMO_INSTRUCTIONS = `Create a Charm Creator instance first.

Then create three Person charms:

1. First person (for live extraction demo):
   - Leave all fields empty
   - Only populate the notes field with:
   "Dr. Maya Rodriguez (she/her)
   maya.rodriguez@biotech.com
   +1-617-555-7890
   Born: 1988-11-03
   Twitter: @drmayar
   LinkedIn: linkedin.com/in/maya-rodriguez

   Biotech researcher specializing in CRISPR gene editing. Lead scientist at GeneTech Labs. Published 25+ peer-reviewed papers. Avid rock climber. Speaks Spanish and English. MIT PhD 2015."

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
"Alex's Favorite Four-Cheese Mac and Cheese

Serves: 8
Prep time: 20 minutes
Cook time: 45 minutes
Difficulty: Medium

This is Alex Kim's go-to comfort food recipe. A decadent blend of four cheeses creates the ultimate creamy mac and cheese with a crispy breadcrumb topping.

Ingredients:
- 1 lb fusilli pasta
- 4 tbsp butter
- 1/4 cup all-purpose flour
- 4 cups whole milk
- 2 cups sharp cheddar cheese, shredded
- 1 cup gruyere cheese, shredded
- 1 cup fontina cheese, shredded
- 1/2 cup parmesan cheese, grated
- 1/2 cup breadcrumbs
- 2 tbsp olive oil
- Salt and pepper to taste

Instructions:
1. Cook fusilli pasta according to package directions until al dente. Drain and set aside.
2. Preheat oven to 375°F.
3. In large pot, melt butter over medium heat. Whisk in flour and cook for 2 minutes.
4. Gradually add milk, whisking constantly until smooth and thickened, about 5 minutes.
5. Reduce heat to low. Stir in cheddar, gruyere, fontina, and half the parmesan until melted and smooth.
6. Season sauce with salt and pepper. Add cooked pasta and stir to coat.
7. Transfer to greased 9x13 baking dish.
8. Mix breadcrumbs with remaining parmesan and olive oil. Sprinkle over pasta.
9. Bake 25-30 minutes until golden brown and bubbling.
10. Let rest 5 minutes before serving.

Tags: comfort food, pasta, cheese, main dish"

Use the exact content and structure provided.`;

export default pattern(() => {
  return SpaceSetup({
    instructions: DEMO_INSTRUCTIONS,
  });
});
