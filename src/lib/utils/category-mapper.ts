import type { IngredientCategory } from "@/lib/types/recipe";

const CATEGORY_KEYWORDS: Record<IngredientCategory, string[]> = {
  produce: [
    "apple", "avocado", "banana", "basil", "bell pepper", "broccoli",
    "carrot", "celery", "cilantro", "corn", "cucumber", "garlic",
    "ginger", "grape", "green bean", "jalapeño", "kale", "lemon",
    "lettuce", "lime", "mango", "mushroom", "onion", "orange",
    "parsley", "pea", "pepper", "potato", "rosemary", "scallion",
    "shallot", "spinach", "squash", "strawberry", "sweet potato",
    "thyme", "tomato", "zucchini", "cabbage", "cauliflower", "eggplant",
    "fennel", "leek", "mint", "oregano", "pear", "pineapple",
    "radish", "sage", "arugula", "asparagus", "beet", "berry",
    "blueberry", "cherry", "chive", "dill", "fig", "green onion",
  ],
  dairy: [
    "butter", "cheese", "cream", "cream cheese", "cheddar", "cottage cheese",
    "egg", "feta", "gouda", "gruyere", "half and half", "heavy cream",
    "milk", "mozzarella", "parmesan", "ricotta", "sour cream",
    "whipping cream", "yogurt", "goat cheese", "brie", "swiss",
    "provolone", "jack", "colby", "mascarpone", "ghee",
  ],
  meat: [
    "bacon", "beef", "chicken", "ground beef", "ground turkey", "ham",
    "lamb", "pork", "prosciutto", "salami", "sausage", "steak",
    "turkey", "veal", "venison", "brisket", "chorizo", "duck",
    "pepperoni", "ribs", "roast", "tenderloin", "thigh", "breast",
    "wing", "drumstick",
  ],
  seafood: [
    "anchovy", "clam", "cod", "crab", "fish", "halibut", "lobster",
    "mussel", "oyster", "salmon", "sardine", "scallop", "shrimp",
    "squid", "swordfish", "tilapia", "tuna", "prawn", "bass",
    "trout", "mahi",
  ],
  bakery: [
    "bagel", "baguette", "bread", "brioche", "bun", "ciabatta",
    "cornbread", "croissant", "english muffin", "flatbread",
    "focaccia", "naan", "pita", "roll", "sourdough", "tortilla",
    "wrap",
  ],
  pantry: [
    "almond", "baking powder", "baking soda", "bean", "broth",
    "brown sugar", "cashew", "chickpea", "chocolate", "coconut milk",
    "cornstarch", "couscous", "flour", "honey", "jam", "lentil",
    "maple syrup", "noodle", "oat", "olive oil", "pasta", "peanut butter",
    "pecan", "quinoa", "rice", "sesame oil", "stock", "sugar",
    "sunflower seed", "tahini", "tofu", "tomato paste", "tomato sauce",
    "vegetable oil", "vinegar", "walnut", "yeast", "breadcrumb",
    "canned tomato", "coconut", "corn starch", "cracker",
    "dried fruit", "granola", "hazelnut", "molasses", "nut",
    "olive", "peanut", "pistachio", "polenta", "raisin",
    "semolina", "spaghetti", "tapioca", "tortellini",
  ],
  frozen: [
    "frozen berry", "frozen corn", "frozen pea", "frozen spinach",
    "frozen vegetable", "ice cream", "frozen fruit", "frozen pizza",
  ],
  spices: [
    "allspice", "anise", "bay leaf", "black pepper", "cardamom",
    "cayenne", "chili flake", "chili powder", "cinnamon", "clove",
    "coriander", "cumin", "curry", "garlic powder", "ginger powder",
    "mustard seed", "nutmeg", "onion powder", "oregano dried",
    "paprika", "pepper flake", "red pepper", "saffron", "salt",
    "smoked paprika", "star anise", "thyme dried", "turmeric",
    "vanilla", "white pepper",
  ],
  condiments: [
    "bbq sauce", "dijon", "fish sauce", "hot sauce", "ketchup",
    "mayonnaise", "mayo", "mustard", "oyster sauce", "relish",
    "salsa", "soy sauce", "sriracha", "teriyaki", "wasabi",
    "worcestershire", "hoisin", "chimichurri", "pesto",
    "ranch", "buffalo sauce", "aioli",
  ],
  beverages: [
    "beer", "bourbon", "brandy", "champagne", "cider", "club soda",
    "coffee", "gin", "juice", "lemonade", "liqueur", "red wine",
    "rum", "sake", "sparkling water", "tea", "tequila", "vodka",
    "whiskey", "white wine", "wine",
  ],
  other: [],
};

export function guessIngredientCategory(name: string): IngredientCategory {
  const lower = name.toLowerCase().trim();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "other") continue;
    for (const keyword of keywords) {
      if (lower.includes(keyword) || keyword.includes(lower)) {
        return category as IngredientCategory;
      }
    }
  }

  return "other";
}

export const CATEGORY_DISPLAY_ORDER: IngredientCategory[] = [
  "produce",
  "dairy",
  "meat",
  "seafood",
  "bakery",
  "pantry",
  "frozen",
  "spices",
  "condiments",
  "beverages",
  "other",
];

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  produce: "Produce",
  dairy: "Dairy & Eggs",
  meat: "Meat & Poultry",
  seafood: "Seafood",
  bakery: "Bakery",
  pantry: "Pantry",
  frozen: "Frozen",
  spices: "Spices & Seasonings",
  condiments: "Condiments & Sauces",
  beverages: "Beverages",
  other: "Other",
};
