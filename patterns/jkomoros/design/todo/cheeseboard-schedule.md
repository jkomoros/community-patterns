# Cheeseboard Schedule with Ingredient Preferences

## Overview
Pattern that fetches the Cheeseboard pizza schedule, splits ingredients, allows thumbs up/down on each ingredient, tracks liked/disliked ingredients, and ranks pizzas.

## Status: ✅ COMPLETE

All core features implemented:

- ✅ Fetch webpage from Cheeseboard pizza schedule
- ✅ Parse upcoming pizzas with dates and ingredients
- ✅ Split pizza descriptions into individual ingredients
- ✅ Display each ingredient with thumbs up/down chips
- ✅ Maintain persistent list of liked/disliked ingredients
- ✅ Color-code ingredients: green for liked, red for disliked
- ✅ Rank pizzas based on liked ingredients (+1 liked, -2 disliked)
- ✅ Score emoji display (😍/😊/😐/😕/🤢)
- ✅ Export preferences for other patterns

## Ingredient Normalization

The pattern normalizes ingredients for matching:
- Lowercase, trim, remove accents
- Strip quality adjectives (fresh, aged)
- Handle synonyms (parmesan = parmigiano reggiano)
- Singularize common plurals

**What matches:** "tomato" = "tomatoes", "fresh mozzarella" = "mozzarella"
**What stays different:** "red onion" ≠ "onion", "roasted garlic" ≠ "garlic"

## File Location
`patterns/jkomoros/cheeseboard-schedule.tsx`
