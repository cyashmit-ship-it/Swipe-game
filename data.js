// =====================================================================
//  GAME CONTENT AND SETTINGS — this is the only file you need to edit
//  for text, photos and the results-sheet link.
// =====================================================================

const GAME = {
  // Paste the Apps Script web app URL here (it ends in /exec).
  scriptUrl: "https://script.google.com/macros/s/AKfycbzl2MKv2vZH6tWhssXQCWOPy9rTw88mmeg2slhx4xBrKA1Cdk824qc2TPlahnrvxJ8/exec",

  // WORKING TITLE — final name and intro copy still to be decided.
  title: "Is It a Match?",
  intro:
    "Ten dishes are on the app tonight. Some want a twist, some want to stay exactly as they are. " +
    "Swipe right if you'd try the twist. Swipe left if you'd keep it classic.",
  startButton: "Start swiping",

  rounds: {
    1: {
      tag: "Chinese twist",
      question: "Would you try a Chinese twist on this?",
      hint: "Yes means you'd try a Chinese-style version of this Indian dish.",
    },
    2: {
      tag: "Indian twist",
      question: "Would you try this cuisine with an Indian twist?",
      hint: "Yes means you'd like this cuisine made the desi way.",
    },
  },

  // Shown once, just before the first cuisine card.
  plotTwist: {
    title: "Plot twist!",
    text: "Now cuisines from around the world are on the app. Would you give them an Indian twist?",
    button: "Show me",
  },

  // End-of-game profile, picked by the number of Yes + Super Like answers.
  profiles: [
    { max: 2, name: "The Loyal Purist", line: "You love food exactly the way it was first made." },
    { max: 4, name: "The Picky Romantic", line: "You don't swipe right often, but when you do, you mean it." },
    { max: 6, name: "The Open-Minded Dater", line: "Half classic, half curious. A very balanced palate." },
    { max: 8, name: "The Fusion Flirt", line: "You look at a dish and wonder what it could become." },
    { max: 10, name: "The Food Adventurer", line: "No cuisine is safe from your curiosity." },
  ],
};

// ---------------------------------------------------------------------
//  CARDS — fixed order. Do not reorder or rename the ids: the results
//  sheet columns follow this exact order (see apps-script/Code.gs).
//
//  Photos: put files in the images/ folder with exactly these names.
//  Until a photo exists, the card shows a placeholder.
// ---------------------------------------------------------------------

const CARDS = [
  {
    id: "dosa",
    part: 1,
    name: "Masala Dosa",
    from: "Bengaluru",
    bio: "Crispy on the outside, soft potato heart inside.",
    chips: ["Crispy", "Mildly spiced", "Breakfast hero"],
    photos: [{ src: "images/dosa.jpg", emoji: "🥞", caption: "Masala Dosa" }],
    twist: {
      name: "Schezwan Dosa",
      line: "The same crispy dosa, spread with fiery Schezwan sauce and stuffed with veg noodles.",
      photo: { src: "images/dosa-chinese.jpg", emoji: "🌶️", caption: "Schezwan Dosa" },
    },
    classicLine: "Masala Dosa stays just the way it is: crispy, golden, with sambar on the side.",
  },
  {
    id: "samosa",
    part: 1,
    name: "Samosa",
    from: "Every chai stall in India",
    bio: "Triangle-shaped, tea-time famous, never been ghosted.",
    chips: ["Deep-fried", "Spiced potato", "Chai partner"],
    photos: [{ src: "images/samosa.jpg", emoji: "🥟", caption: "Samosa" }],
    twist: {
      name: "Noodle Samosa",
      line: "A crispy samosa shell packed with chilli-garlic hakka noodles.",
      photo: { src: "images/samosa-chinese.jpg", emoji: "🍜", caption: "Noodle Samosa" },
    },
    classicLine: "Samosa stays classic: spiced potato, peas and two chutneys.",
  },
  {
    id: "korean",
    part: 2,
    name: "Korean",
    from: "Seoul",
    bio: "Bold, saucy and a little bit spicy. K-drama's favourite food.",
    chips: ["Sweet-spicy", "Saucy", "Trending"],
    photos: [
      { src: "images/korean-1.jpg", emoji: "🍗", caption: "Korean Fried Chicken", line: "Double-fried and glazed in sweet-spicy gochujang." },
      { src: "images/korean-2.jpg", emoji: "🍜", caption: "Ramyeon", line: "Fiery instant noodles, K-drama style." },
    ],
    teasers: ["Butter-chicken glazed Korean fried chicken", "Masala ramyeon with a jeera tadka"],
    authenticLine: "Korean stays Korean: gochujang, kimchi and all.",
  },
  {
    id: "italian",
    part: 2,
    name: "Italian",
    from: "Rome",
    bio: "Carbs, cheese and a lot of olive oil.",
    chips: ["Cheesy", "Comforting", "Herby"],
    photos: [
      { src: "images/italian-1.jpg", emoji: "🍝", caption: "Pasta", line: "Penne in a rich tomato and basil sauce." },
      { src: "images/italian-2.jpg", emoji: "🍕", caption: "Pizza", line: "Thin crust, mozzarella and fresh basil." },
    ],
    teasers: ["Makhani pasta", "Achari paneer pizza"],
    authenticLine: "Italian stays Italian: olive oil, basil and parmesan.",
  },
  {
    id: "bhel",
    part: 1,
    name: "Bhel Puri",
    from: "Juhu Beach, Mumbai",
    bio: "Chatpata, crunchy and always the life of the party.",
    chips: ["Tangy", "Crunchy", "Street star"],
    photos: [{ src: "images/bhel.jpg", emoji: "🥗", caption: "Bhel Puri" }],
    twist: {
      name: "Chinese Bhel",
      line: "Crispy fried noodles tossed with Schezwan sauce, cabbage and spring onion.",
      photo: { src: "images/bhel-chinese.jpg", emoji: "🥡", caption: "Chinese Bhel" },
    },
    classicLine: "Bhel Puri stays classic: puffed rice, sev, tamarind and green chutney.",
  },
  {
    id: "thai",
    part: 2,
    name: "Thai",
    from: "Bangkok",
    bio: "Fragrant and fresh, balancing sweet, sour and spicy.",
    chips: ["Fragrant", "Coconut", "Zesty"],
    photos: [
      { src: "images/thai-1.jpg", emoji: "🍛", caption: "Thai Green Curry", line: "Coconut curry with Thai basil and green chillies." },
      { src: "images/thai-2.jpg", emoji: "🍜", caption: "Pad Thai", line: "Stir-fried rice noodles with peanuts and lime." },
    ],
    teasers: ["Green curry with curry leaves, served with appam", "Pad Thai chaat with imli chutney"],
    authenticLine: "Thai stays Thai: lemongrass, basil and lime.",
  },
  {
    id: "chaap",
    part: 1,
    name: "Soya Chaap",
    from: "Delhi",
    bio: "Delhi's favourite protein, straight off the tandoor.",
    chips: ["Smoky", "Protein-packed", "Tandoori"],
    photos: [{ src: "images/chaap.jpg", emoji: "🍢", caption: "Soya Chaap" }],
    twist: {
      name: "Chilli Soya Chaap",
      line: "Tossed in a sticky chilli-garlic sauce with peppers and onions.",
      photo: { src: "images/chaap-chinese.jpg", emoji: "🌶️", caption: "Chilli Soya Chaap" },
    },
    classicLine: "Soya Chaap stays classic: smoky, creamy and fresh off the tandoor.",
  },
  {
    id: "mexican",
    part: 2,
    name: "Mexican",
    from: "Mexico City",
    bio: "Big flavours, bigger fiestas.",
    chips: ["Spicy", "Zingy", "Handheld"],
    photos: [
      { src: "images/mexican-1.jpg", emoji: "🌮", caption: "Tacos", line: "Soft tortillas with salsa and fillings." },
      { src: "images/mexican-2.jpg", emoji: "🌯", caption: "Burrito", line: "A wrap stuffed with rice, beans and cheese." },
    ],
    teasers: ["Tandoori paneer tacos", "Rajma-chawal burrito"],
    authenticLine: "Mexican stays Mexican: salsa, lime and jalapeños.",
  },
  {
    id: "pavbhaji",
    part: 1,
    name: "Pav Bhaji",
    from: "Mumbai",
    bio: "Buttery, spicy and impossible to share.",
    chips: ["Buttery", "Spicy", "Comfort food"],
    photos: [{ src: "images/pavbhaji.jpg", emoji: "🍛", caption: "Pav Bhaji" }],
    twist: {
      name: "Schezwan Pav Bhaji",
      line: "Bhaji with a Schezwan swirl, pav toasted in chilli-garlic butter.",
      photo: { src: "images/pavbhaji-chinese.jpg", emoji: "🔥", caption: "Schezwan Pav Bhaji" },
    },
    classicLine: "Pav Bhaji stays classic: a pool of butter, onions and lemon.",
  },
  {
    id: "japanese",
    part: 2,
    name: "Japanese",
    from: "Tokyo",
    bio: "Precise, delicate and quietly confident.",
    chips: ["Delicate", "Umami", "Fresh"],
    photos: [
      { src: "images/japanese-1.jpg", emoji: "🍣", caption: "Sushi", line: "Vinegared rice rolls with fresh fillings." },
      { src: "images/japanese-2.jpg", emoji: "🍜", caption: "Ramen", line: "Slow-cooked broth with noodles and egg." },
    ],
    teasers: ["Tandoori paneer sushi roll", "Rasam ramen"],
    authenticLine: "Japanese stays Japanese: soy, wasabi and ginger.",
  },
];
