package main

type showcaseMember struct {
	Handle    string
	First     string
	Last      string
	Bio       string
	Location  string
	Gender    string
	BirthYear int
	Public    bool
	Avatar    bool
	Cover     bool
}

var showcaseMembers = []showcaseMember{
	{"avachen", "Ava", "Chen", "Product designer. I make confusing things feel obvious. Tea over coffee, always.", "San Francisco, CA", "female", 1993, true, true, true},
	{"marcusb", "Marcus", "Bennett", "Photographer chasing light, mostly at unhelpful hours. Prints and film on request.", "London, UK", "male", 1988, true, true, true},
	{"sofiar", "Sofia", "Rossi", "Food writer. If it can be turned into a sauce, I will find a way.", "Rome, Italy", "female", 1990, true, true, true},
	{"liamoc", "Liam", "O'Connor", "Backend engineer. I delete more code than I write and I'm at peace with it.", "Dublin, Ireland", "male", 1991, true, true, true},
	{"zarah", "Zara", "Haddad", "Travel writer with a bad sense of direction and excellent luck.", "Dubai, UAE", "female", 1994, true, true, true},
	{"noahkim", "Noah", "Kim", "Songwriter and reluctant frontman. New EP out when it stops changing.", "Seoul, South Korea", "male", 1992, true, true, true},
	{"emmal", "Emma", "Larsson", "Illustrator. Foxes, clouds and other soft things.", "Stockholm, Sweden", "female", 1996, true, true, false},
	{"diegof", "Diego", "Fernández", "Chef. Seasonal, local, and unreasonably passionate about basil.", "Barcelona, Spain", "male", 1987, true, true, true},
	{"priyanair", "Priya", "Nair", "Data scientist. Turning noise into 'it depends'. Runner of slow marathons.", "Bangalore, India", "female", 1992, true, true, true},
	{"lucasm", "Lucas", "Moreau", "Filmmaker. I shoot on whatever is charged.", "Paris, France", "male", 1989, true, true, false},
	{"hanas", "Hana", "Suzuki", "Ceramicist. I make cups you will argue over who gets.", "Kyoto, Japan", "female", 1995, true, true, false},
	{"omarf", "Omar", "Farouk", "Cyclist and occasional cartographer. I will draw you a map you can't read.", "Cairo, Egypt", "male", 1993, true, true, true},
	{"isabellas", "Isabella", "Santos", "Dancer, teacher, professional counter of eights.", "São Paulo, Brazil", "female", 1997, true, true, true},
	{"ethanw", "Ethan", "Walker", "Climber. I fall off rocks so you don't have to.", "Denver, USA", "male", 1990, true, true, false},
	{"amarao", "Amara", "Okafor", "Novelist. Draft three is where the magic happens. Allegedly.", "Lagos, Nigeria", "female", 1988, true, false, false},
	{"felixw", "Felix", "Wagner", "Architect. Concrete, timber, and one large tree.", "Berlin, Germany", "male", 1985, true, true, false},
	{"meilin", "Mei", "Lin", "UX researcher. I ask 'why' until someone gives me a straight answer.", "Taipei, Taiwan", "female", 1993, true, true, false},
	{"jonasb", "Jonas", "Berg", "Coffee roaster. Notes of blueberry, cocoa and mild existential doubt.", "Oslo, Norway", "male", 1991, true, true, true},
	{"zahraar", "Zahraa", "Rahman", "Marine biologist. Counting fish and hoping you count them too.", "Malé, Maldives", "female", 1994, true, true, false},
	{"tomass", "Tomás", "Silva", "Football coach. Pre-season optimist, in-season realist.", "Lisbon, Portugal", "male", 1986, true, false, false},
	{"gracem", "Grace", "Miller", "Yoga teacher. Breathe first, post later.", "Austin, USA", "female", 1994, false, true, false},
	{"ravip", "Ravi", "Patel", "Founder. Shipping beats perfect, most days.", "Mumbai, India", "male", 1989, true, true, false},
	{"nadiap", "Nadia", "Petrova", "Pianist. Practising the same bar for the eleventh time.", "Vienna, Austria", "female", 1987, false, true, false},
	{"kwamem", "Kwame", "Mensah", "Documentary journalist. Listening is the job.", "Accra, Ghana", "male", 1990, true, true, true},
}

type showcaseComment struct {
	Author   string
	Text     string
	AgeHours int
	Photo    bool
	SVG      bool
}

type showcasePost struct {
	Author   string
	Content  string
	Privacy  string
	Selected []string
	Photos   int
	AgeHours int
	Comments []showcaseComment
}

var showcasePosts = []showcasePost{
	{"avachen", "Shipped a small redesign of our onboarding flow today. The trick was cutting it in half — turns out nobody reads the third slide. #design #ux", "", nil, 2, 3, []showcaseComment{
		{"marcusb", "The cut is always the hardest part. This looks so much calmer.", 2, false, false},
		{"priyanair", "Would love to see the before and after 👀", 2, false, false},
		{"sofiar", "Beautiful use of whitespace ✨", 1, false, false},
		{"liamoc", "Cutting it in half is the real skill here.", 1, false, false},
		{"meilin", "The empty state finally makes sense now.", 1, false, false},
	}},
	{"diegof", "Sunday market haul: heirloom tomatoes, a heavy sourdough, and far too much basil. Pesto incoming. #food #cooking", "", nil, 1, 5, []showcaseComment{
		{"sofiar", "That basil is going to become something wonderful, I can feel it.", 4, false, false},
		{"avachen", "Recipe when? 🙏", 3, false, false},
		{"jonasb", "Pair that with a light natural wine and you're set.", 3, true, false},
	}},
	{"marcusb", "Golden hour on the coast road. Rolled out of bed at 5am for this light and I would do it again in a heartbeat. #photography #goldenhour", "", nil, 3, 8, []showcaseComment{
		{"emmal", "The second frame is unreal.", 7, false, false},
		{"ethanw", "That climb is brutal, worth it for the view though.", 6, false, false},
		{"amarao", "Print the middle one. I will buy it.", 5, false, true},
		{"lucasm", "The grain in the first frame is perfect.", 5, false, false},
	}},
	{"zarah", "Three days in the Atlas Mountains with nothing but a daypack and a bad sense of direction. Best wrong turns I have ever taken. #travel #hiking @omarf", "", nil, 2, 12, []showcaseComment{
		{"omarf", "Next time bring the map I drew you 😄", 11, false, false},
		{"priyanair", "Adding this to my list immediately.", 10, false, false},
		{"lucasm", "The light in these is gorgeous.", 9, false, false},
		{"zahraar", "Adding this route to my list too.", 9, false, false},
		{"ethanw", "Those switchbacks look like a proper adventure.", 8, false, false},
	}},
	{"priyanair", "Spent the morning explaining p-values to a room of very patient product managers. Best line of the day: a small p-value means the data is loud, not that the effect matters. #datascience", "", nil, 0, 24, []showcaseComment{
		{"liamoc", "Saving this for my next standup.", 23, false, false},
		{"meilin", "Framing it as loud versus important — I am stealing that.", 22, false, false},
		{"avachen", "Please run this session again for our team.", 20, false, false},
		{"ravip", "Loud versus important. That is the whole job.", 19, false, false},
	}},
	{"liamoc", "Refactored a 900-line function into six small ones and the diff finally reads like a sentence. Small functions, big calm. #coding #golang", "", nil, 1, 28, []showcaseComment{
		{"noahkim", "The best kind of pull request.", 27, false, false},
		{"ravip", "Shipping this energy to my team today.", 26, false, false},
	}},
	{"noahkim", "Wrote a bridge that has been stuck in my head for a month. Sometimes you just have to let the song win. Playing it live on Friday. #music", "", nil, 1, 40, []showcaseComment{
		{"hanas", "Cannot wait to hear it.", 39, false, false},
		{"isabellas", "This is going to be on repeat, I can already tell.", 38, false, false},
	}},
	{"emmal", "New illustration for a children's book about a fox who collects clouds. Gouache and a great deal of patience. #illustration #art", "", nil, 2, 54, []showcaseComment{
		{"avachen", "The fox's little satchel 😍", 53, false, false},
		{"amarao", "I want to live inside this colour palette.", 50, false, true},
	}},
	{"hanas", "Pulled a batch of teacups out of the kiln this morning. Three survived. That counts as a good day. #ceramics", "", nil, 1, 72, []showcaseComment{
		{"jonasb", "The glaze on the middle one is stunning.", 71, false, false},
		{"zarah", "I will take the wonky one, it has character.", 70, false, false},
	}},
	{"amarao", "Draft two of the novel is done. Ninety-four thousand words and I still do not know if the ending works — which, apparently, is normal. #writing", "", nil, 0, 80, []showcaseComment{
		{"priyanair", "Congratulations! Apparently normal is the writer's whole life.", 79, false, false},
		{"emmal", "So proud of you.", 78, false, false},
	}},
	{"ethanw", "Sent my hardest project of the season yesterday — a crimpy little overhang that took three weekends to figure out. Hands are wrecked, ego is restored. #climbing", "", nil, 2, 96, []showcaseComment{
		{"marcusb", "That final move looks terrifying.", 95, false, false},
		{"zahraar", "The send face in the second photo says it all 😄", 94, false, false},
	}},
	{"isabellas", "Rehearsal for the spring show. Eleven dancers, one tiny stage, and a piece of music that will not let us rest. #dance @nadiap", "", nil, 1, 104, []showcaseComment{
		{"nadiap", "Playing for you all is the highlight of my month.", 103, false, false},
		{"noahkim", "The choreography is unreal.", 102, false, false},
	}},
	{"felixw", "Model for a courtyard house in the hills. Concrete, timber, and one very large tree we refused to cut down. #architecture", "", nil, 2, 120, []showcaseComment{
		{"lucasm", "The light well is doing so much work here.", 118, false, false},
		{"priyanair", "Glad the tree won.", 116, false, false},
	}},
	{"zahraar", "Coral survey day. Water was clear, the reef was loud, and we counted more juvenile fish than last season. Small wins matter. #ocean #conservation", "", nil, 1, 132, []showcaseComment{
		{"zarah", "This made my whole week.", 130, false, true},
		{"tomass", "Incredible work.", 128, false, false},
	}},
	{"jonasb", "Roasted a new Ethiopian natural this week — blueberry, cocoa, and just a hint of something I cannot name yet. Come taste it. #coffee", "", nil, 1, 144, []showcaseComment{
		{"diegof", "On my way.", 143, false, false},
		{"avachen", "The blueberry note is not a drill.", 142, false, false},
	}},
	{"ravip", "We just crossed ten thousand users. Two years ago this was a spreadsheet and a dream. Thank you to everyone who believed early. #startup", "", nil, 0, 168, []showcaseComment{
		{"priyanair", "Huge. Congratulations!", 167, false, false},
		{"liamoc", "Onwards 🚀", 166, false, false},
	}},
	{"tomass", "Pre-season starts Monday. New drills, new faces, same impossible goal. This group is special. #football", "followers", nil, 1, 170, []showcaseComment{
		{"lucasm", "Rooting for you all season.", 169, false, false},
		{"ethanw", "The fitness test is going to be brutal 😅", 168, false, false},
	}},
	{"gracem", "Morning stretch by the lake before the world wakes up. If you needed a sign to slow down today, here it is. #yoga", "", nil, 1, 176, []showcaseComment{
		{"zahraar", "Exactly what I needed to read.", 175, false, false},
		{"isabellas", "Adding this to my morning routine.", 174, false, false},
	}},
	{"avachen", "A quieter photo, just for the people who follow my work closely. Thank you for being here. #design", "selected", []string{"marcusb", "sofiar", "priyanair"}, 1, 46, []showcaseComment{
		{"marcusb", "Honoured to be in this little circle.", 45, false, false},
	}},
	{"dummyuser", "First post on the new feed! Testing the composer, the crop tool and, most importantly, the coffee. ☕ #socialnetwork", "", nil, 1, 6, []showcaseComment{
		{"alexdemo", "The composer feels so much smoother now.", 5, false, false},
		{"marcusb", "Great shot for a test post, honestly.", 4, false, false},
	}},
	{"alexdemo", "Trying out the new feed layout with some friends @dummyuser 👋 Really loving how the photos look now. #socialnetwork", "", nil, 1, 20, []showcaseComment{
		{"dummyuser", "Welcome back 👋", 19, false, false},
		{"avachen", "The layout looks great!", 18, false, false},
	}},
	{"omarf", "Weekend ride: 80km, one wrong turn, and the best flat white at kilometre 60. The hills never get easier, you just get better at them. #cycling", "", nil, 2, 90, []showcaseComment{
		{"ethanw", "80km is no joke. That elevation profile looks brutal.", 88, false, false},
		{"zarah", "The cafe stop is the real training, let's be honest.", 86, false, false},
		{"lucasm", "Third photo is my favourite.", 84, true, false},
	}},
	{"felixw", "Site visit this morning. The timber frame is up and the big oak we refused to cut is doing exactly what we hoped — it frames the whole entrance. #architecture #timber", "", nil, 2, 98, []showcaseComment{
		{"lucasm", "That overhang is going to throw beautiful shadows all summer.", 96, false, false},
		{"marcusb", "Building around the tree was the right call.", 94, false, false},
	}},
	{"meilin", "Five usability sessions this week. The most useful sentence I heard: 'I didn't know I could do that.' That is a design bug, not a user problem. #ux #research", "", nil, 0, 106, []showcaseComment{
		{"avachen", "I am putting that line on the studio wall.", 104, false, false},
		{"liamoc", "Discoverability is the feature nobody budgets for.", 102, false, false},
		{"priyanair", "Every product team needs to hear this once a week.", 100, false, false},
	}},
	{"hanas", "Glaze tests are in. The celadon finally broke the way I wanted — soft and a little unpredictable. Twelve more cups to trim tonight. #ceramics #pottery", "", nil, 1, 118, []showcaseComment{
		{"emmal", "The colour on the second cup 😍", 116, false, false},
		{"sofiar", "I would drink everything out of these.", 114, false, false},
	}},
	{"kwamem", "Spent the day in a fishing village recording interviews for a radio piece. People tell you everything once the recorder has been running for twenty minutes. #journalism", "", nil, 1, 130, []showcaseComment{
		{"amarao", "The waiting is the whole craft. Cannot wait to hear it.", 128, false, false},
		{"zahraar", "This is the kind of story that stays with you for years.", 126, false, false},
	}},
	{"nadiap", "First rehearsal with the string quartet for the spring programme. Schubert at 7am is a strange and beautiful way to start a day. #music #piano", "", nil, 1, 142, []showcaseComment{
		{"isabellas", "Playing for our rehearsal was a gift. Thank you.", 140, false, false},
		{"noahkim", "Schubert before breakfast, respect.", 138, false, false},
	}},
	{"lucasm", "Locked the edit for the short film. Ninety minutes of footage down to eleven. Cutting is just deciding what the story refuses to be about. #filmmaking", "", nil, 1, 154, []showcaseComment{
		{"marcusb", "Eleven minutes from ninety is a heroic edit.", 152, false, false},
		{"felixw", "Screening when? I will bring the good coffee.", 150, false, false},
	}},
	{"emmal", "Sketchbook spread from this week — foxes, rain, and one very patient cat. Trying to draw a little every day, even on the days it is bad. #illustration #sketchbook", "", nil, 2, 166, []showcaseComment{
		{"avachen", "The rainy window panel is so cosy.", 164, false, false},
		{"hanas", "Daily drawing is the whole secret, isn't it.", 162, false, false},
	}},
	{"isabellas", "Six weeks out from the show and my calves have opinions. Four hours of rehearsal and I loved every loud minute of it. #dance", "", nil, 1, 178, []showcaseComment{
		{"nadiap", "The new section is stunning already.", 176, false, false},
		{"gracem", "Your energy is contagious, honestly.", 174, false, false},
	}},
	{"jonasb", "New batch on the roaster: a washed Rwandan with notes of black tea and apricot. If you like your coffee bright, this one is for you. #coffee #roasting", "", nil, 1, 190, []showcaseComment{
		{"diegof", "Saving a bag for me.", 188, false, false},
		{"sofiar", "Apricot is my weakness.", 186, false, false},
	}},
	{"tomass", "Tactical board night. We lost the last match on set pieces, so guess what we are doing all week. Details win games. #football", "", nil, 1, 202, []showcaseComment{
		{"ethanw", "Set pieces are where games are quietly decided.", 200, false, false},
		{"lucasm", "Good luck, coach.", 198, false, false},
	}},
	{"gracem", "Sunrise class by the water this morning. Twenty-two people, one heron, zero phones. Slow is a skill. #yoga #mindfulness", "", nil, 1, 214, []showcaseComment{
		{"zahraar", "Exactly the reminder I needed today.", 212, false, false},
		{"isabellas", "Wish I could have been there.", 210, false, false},
	}},
	{"amarao", "Read the first chapter of the novel out loud to a friend last night. Hearing it in the air is how you find the sentences that only ever worked on the page. #writing", "", nil, 0, 226, []showcaseComment{
		{"emmal", "Reading aloud is brutal and necessary.", 224, false, false},
		{"priyanair", "Cannot wait for the finished thing.", 222, false, false},
	}},
	{"priyanair", "Half marathon done in 1:58. Slower than last year, happier than last year. Running is the only meeting I never skip. #running", "", nil, 1, 238, []showcaseComment{
		{"liamoc", "Congrats! Sub-two is sub-two.", 236, false, false},
		{"gracem", "So proud of you.", 234, false, false},
	}},
	{"ravip", "Interviewed three engineers this week and hired two. The best signal was not the coding test — it was how they talked about the last thing they broke. #startup #hiring", "", nil, 0, 250, []showcaseComment{
		{"liamoc", "Ownership shows up in the stories people tell.", 248, false, false},
		{"meilin", "Stealing this framing for our next loop.", 246, false, false},
	}},
	{"avachen", "Design systems are just promises you keep to your future self. Spent the afternoon documenting a component nobody wants to own. #design #designsystems", "", nil, 1, 262, []showcaseComment{
		{"meilin", "The unglamorous work that saves everyone later.", 260, false, false},
		{"liamoc", "Documentation is a love letter to the next developer.", 258, false, false},
	}},
}

type showcaseLine struct {
	Author   string
	Text     string
	AgeHours int
	Photo    bool
}

type showcaseGroupPost struct {
	Author   string
	Text     string
	AgeHours int
	Photo    bool
	Comments []showcaseLine
}

type showcaseGroupEvent struct {
	Author        string
	Title         string
	Text          string
	StartsInHours int
	Going         []string
	NotGoing      []string
}

type showcaseGroup struct {
	Owner       string
	Title       string
	Description string
	Image       bool
	Members     []string
	Posts       []showcaseGroupPost
	Events      []showcaseGroupEvent
	Messages    []showcaseLine
	Requests    []string
}

var showcaseGroups = []showcaseGroup{
	{
		Owner: "omarf", Title: "Weekend Hikers", Image: true,
		Description: "Maps, wrong turns and the occasional summit. New routes every week.",
		Members:     []string{"zarah", "ethanw", "zahraar", "tomass", "lucasm"},
		Posts: []showcaseGroupPost{
			{"omarf", "Route planned for Saturday: a 12km loop with a stream crossing at the halfway point. Bring more water than you think you need. #hiking", 30, true, []showcaseLine{
				{"zarah", "I am in. Do we need proper boots for the crossing?", 29, false},
				{"ethanw", "Yes, and poles if you have them. That descent is slick.", 28, false},
			}},
			{"ethanw", "Trail conditions update: the upper section is muddy but passable. Saw a family of deer at sunrise. #hiking", 54, true, []showcaseLine{
				{"zahraar", "Jealous. I am stuck at a desk today.", 52, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"omarf", "Saturday ridge loop", "Meet at the car park at 7am. Coffee after, mandatory.", 34, []string{"omarf", "zarah", "ethanw"}, []string{"zahraar"}},
		},
		Messages: []showcaseLine{
			{"omarf", "Everyone good for Saturday? Weather looks perfect.", 26, false},
			{"zarah", "Good for me. Bringing snacks.", 25, false},
			{"ethanw", "Count me in.", 24, true},
			{"lucasm", "What time are we meeting at the car park?", 23, false},
			{"omarf", "7am sharp. An early start beats the midday heat.", 22, false},
			{"tomass", "I might be five minutes late, do not wait for me.", 21, false},
		},
	},
	{
		Owner: "diegof", Title: "Home Cooks", Image: true,
		Description: "Recipes, disasters, and the occasional triumph. No gatekeeping.",
		Members:     []string{"sofiar", "jonasb", "avachen", "priyanair"},
		Posts: []showcaseGroupPost{
			{"diegof", "Recipe drop: slow-roasted tomatoes with garlic and thyme. Four hours in a low oven and you will never buy a jarred sauce again.", 20, true, []showcaseLine{
				{"sofiar", "The four-hour roast is the whole secret, honestly.", 18, false},
				{"jonasb", "Making this tonight. Will report back.", 16, false},
			}},
			{"sofiar", "Question for the group: what is the one ingredient you cannot cook without? Mine is good olive oil.", 44, false, []showcaseLine{
				{"avachen", "Chili flakes. Everything gets chili flakes.", 43, false},
				{"diegof", "Salt. Actual salt, added at the right time.", 40, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"diegof", "Sunday potluck", "Bring one dish and one story. I will supply the pasta.", 50, []string{"diegof", "sofiar", "jonasb"}, []string{"priyanair"}},
		},
		Messages: []showcaseLine{
			{"diegof", "Potluck is at mine this Sunday, 1pm.", 12, false},
			{"sofiar", "I will bring dessert 🍰", 11, false},
			{"jonasb", "I will bring coffee for after.", 10, false},
			{"avachen", "Does anyone have a nut allergy I should plan around?", 9, false},
			{"diegof", "Good question — none that I know of, but I will label everything.", 8, false},
		},
		Requests: []string{"meilin"},
	},
	{
		Owner: "liamoc", Title: "Dev Circle", Image: true,
		Description: "A quiet corner for code reviews, tooling debates and the occasional rant.",
		Members:     []string{"priyanair", "ravip", "meilin", "alexdemo", "dummyuser"},
		Posts: []showcaseGroupPost{
			{"liamoc", "What is the smallest change that gave you the biggest win this month? Mine was adding a single index and watching a page load drop from 900ms to 40ms. #coding", 22, false, []showcaseLine{
				{"priyanair", "Caching a query everyone assumed was cheap. Six hours of profiling for one line.", 21, false},
				{"ravip", "Deleting a feature nobody used. Best pull request of the quarter.", 20, false},
				{"meilin", "Renaming a confusing button. Support tickets dropped by half.", 18, false},
			}},
			{"priyanair", "Reminder that a dashboard nobody opens is not a metric, it is a hobby. Ask who reads it before you build the next one. #datascience", 60, true, []showcaseLine{
				{"liamoc", "Framing this and hanging it above my desk.", 58, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"liamoc", "Virtual code review night", "Bring one pull request you are proud of, or one you are not. Both are welcome.", 72, []string{"liamoc", "priyanair", "ravip"}, nil},
		},
		Messages: []showcaseLine{
			{"ravip", "Anyone free to pair on the migration this week?", 15, false},
			{"liamoc", "Thursday works for me.", 14, false},
			{"dummyuser", "I can join too.", 13, false},
			{"meilin", "Thursday after 3pm for me.", 12, false},
			{"ravip", "Let us do 4pm then. I will send the invite.", 11, false},
		},
	},
	{
		Owner: "marcusb", Title: "Analog Photography", Image: true,
		Description: "Film, darkrooms and the wait for the scans. Shooting slow.",
		Members:     []string{"emmal", "lucasm", "hanas"},
		Posts: []showcaseGroupPost{
			{"marcusb", "Shot a roll of Portra 400 at the coast this weekend. The negative scan is where the magic happens. Post yours below. #photography", 36, true, []showcaseLine{
				{"emmal", "Portra in overcast light is cheating and I love it.", 34, false},
				{"lucasm", "Developed three rolls last night. Two were keepers.", 32, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"marcusb", "Golden hour photowalk", "Meet at the old pier. Bring a camera and no plans.", 10, []string{"marcusb", "emmal", "hanas", "lucasm"}, nil},
		},
		Messages: []showcaseLine{
			{"hanas", "Is the photowalk still on for tomorrow?", 9, false},
			{"marcusb", "Still on. Sunset is at 7:42, do not be late 😄", 8, false},
			{"emmal", "Bringing two rolls, one is probably expired.", 7, false},
			{"lucasm", "Expired film is where the surprises live.", 6, false},
		},
		Requests: []string{"isabellas"},
	},
	{
		Owner: "priyanair", Title: "Trail Runners", Image: true,
		Description: "Long runs, early starts and the search for the perfect hill. All paces welcome.",
		Members:     []string{"liamoc", "meilin", "ravip", "gracem", "dummyuser"},
		Posts: []showcaseGroupPost{
			{"priyanair", "Saturday long run: 18km on the river trail, mostly flat, one honest hill at the end. Coffee after, non-negotiable. #running", 26, true, []showcaseLine{
				{"liamoc", "I am in. 18km is my limit but the coffee is a good motivator.", 24, false},
				{"meilin", "Count me in for the first 12km.", 22, false},
			}},
			{"gracem", "Reminder that recovery is training too. Stretch, hydrate, sleep. Your legs will thank you tomorrow. #running", 50, false, []showcaseLine{
				{"priyanair", "Saving this for my stubborn self.", 48, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"priyanair", "River trail long run", "Meet at the bridge at 7am. 18km, flat-ish, coffee at the end.", 40, []string{"priyanair", "liamoc", "gracem"}, []string{"meilin"}},
		},
		Messages: []showcaseLine{
			{"priyanair", "Long run is on for Saturday. Who is in?", 30, false},
			{"liamoc", "In. I will bring the electrolyte tabs.", 28, false},
			{"gracem", "Me too. Can we keep the pace conversational?", 27, false},
			{"priyanair", "Always. If we cannot talk, we are going too fast.", 26, false},
		},
	},
	{
		Owner: "amarao", Title: "Book Circle", Image: true,
		Description: "One book a month, no guilt about the ones we skip. Bring your margins and your arguments.",
		Members:     []string{"emmal", "priyanair", "zarah", "meilin"},
		Posts: []showcaseGroupPost{
			{"amarao", "This month's pick is a slim one to recover from last month's doorstop: short stories about small towns. Discussion is the last Sunday. #books", 34, true, []showcaseLine{
				{"emmal", "Slim and devastating, my favourite genre.", 32, false},
				{"zarah", "Ordered it. The third story already has me.", 30, false},
			}},
			{"meilin", "Question for the circle: do you read the introduction, or skip straight to chapter one?", 58, false, []showcaseLine{
				{"priyanair", "Skip. Introductions always spoil the ending.", 56, false},
				{"amarao", "I read it after, if the book has earned it.", 54, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"amarao", "Short story discussion", "Last Sunday of the month, 6pm. Bring one passage you underlined.", 90, []string{"amarao", "emmal", "zarah"}, nil},
		},
		Messages: []showcaseLine{
			{"amarao", "Reminder: discussion moved to 6pm so we can all make it.", 20, false},
			{"zarah", "Perfect, thank you.", 19, false},
		},
		Requests: []string{"hanas"},
	},
	{
		Owner: "zahraar", Title: "Ocean Guardians", Image: true,
		Description: "Reef surveys, beach cleanups and the small wins that keep a coastline alive.",
		Members:     []string{"marcusb", "ethanw", "omarf", "gracem", "avachen"},
		Posts: []showcaseGroupPost{
			{"zahraar", "Next survey dive is scheduled. We are counting juvenile fish again, so bring your slates and your patience. Water was 27°C last week. #ocean #conservation", 18, true, []showcaseLine{
				{"ethanw", "First survey for me. What should I read before we go?", 16, false},
				{"zahraar", "I will send the species guide tonight.", 15, false},
			}},
			{"marcusb", "Beach cleanup haul from Sunday: eleven bags and one very tired group of volunteers. Thank you all. #conservation", 46, true, []showcaseLine{
				{"gracem", "That is a lot of bottles. Well done, everyone.", 44, false},
				{"avachen", "Next time I am bringing the whole studio.", 42, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"zahraar", "Reef survey dive", "Meet at the dock at 6:30am. Two dives, lunch on the boat.", 60, []string{"zahraar", "ethanw", "marcusb"}, []string{"omarf"}},
		},
		Messages: []showcaseLine{
			{"zahraar", "Tanks are booked for Saturday. Bring a warm layer for the surface interval.", 24, false},
			{"ethanw", "Noted. Do we need our own slates?", 23, false},
			{"marcusb", "I have spares if anyone forgets.", 22, false},
		},
	},
	{
		Owner: "omarf", Title: "Cyclists Club", Image: true,
		Description: "Road, gravel and everything in between. Route maps posted every Thursday.",
		Members:     []string{"ethanw", "felixw", "lucasm", "tomass"},
		Posts: []showcaseGroupPost{
			{"omarf", "New route this week: a gravel loop through the valley with one climb that will absolutely hurt. Map in the comments. #cycling", 28, true, []showcaseLine{
				{"felixw", "That gradient at kilometre 20 is a war crime.", 26, false},
				{"lucasm", "Count me in. I will bring the camera.", 24, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"omarf", "Valley gravel loop", "Roll out at 7:30am. Gravel tyres recommended, coffee mandatory.", 30, []string{"omarf", "felixw", "lucasm"}, []string{"tomass"}},
		},
		Messages: []showcaseLine{
			{"omarf", "Forecast looks dry for the loop. Bringing the good tyres.", 14, false},
			{"felixw", "I will meet you at the second junction.", 13, false},
		},
		Requests: []string{"kwamem"},
	},
	{
		Owner: "noahkim", Title: "Music Room", Image: true,
		Description: "Demos, unfinished lyrics and the honest feedback that helps them get finished.",
		Members:     []string{"nadiap", "isabellas", "lucasm", "hanas"},
		Posts: []showcaseGroupPost{
			{"noahkim", "Posted a rough demo of the new song. Ignore the hum, the neighbours were home. Feedback very welcome. #music", 16, true, []showcaseLine{
				{"nadiap", "The bridge is the best part. Do not touch it.", 14, false},
				{"isabellas", "Already choreographing to this.", 12, false},
				{"lucasm", "The hum adds character, honestly.", 10, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"noahkim", "Listening session", "Bring one song you are stuck on. We listen, we talk, nobody is precious.", 55, []string{"noahkim", "nadiap", "isabellas"}, nil},
		},
		Messages: []showcaseLine{
			{"noahkim", "Uploaded the demo to the shared folder.", 10, false},
			{"nadiap", "Listening now. The outro is gorgeous.", 9, false},
			{"isabellas", "Send it to me, I want to try something.", 8, false},
		},
		Requests: []string{"emmal"},
	},
}

type showcaseDM struct {
	Lines []showcaseLine
}

var showcaseDMs = []showcaseDM{
	{Lines: []showcaseLine{
		{"avachen", "Hey! Saw your post about the feed layout — it really does look great.", 9, false},
		{"dummyuser", "Thanks Ava! We have been waiting to ship it for weeks.", 8, false},
		{"avachen", "Worth the wait. Quick question about the empty state, do you have five minutes?", 7, false},
		{"dummyuser", "Go for it.", 6, false},
		{"avachen", "Perfect — want me to mock something up before the next review? 🙌", 2, false},
	}},
	{Lines: []showcaseLine{
		{"alexdemo", "Morning! Did you see the new photo viewer?", 30, false},
		{"dummyuser", "Just tried it, the swipe between photos is so smooth.", 28, false},
		{"alexdemo", "Right? Let us show the team at standup.", 27, true},
	}},
	{Lines: []showcaseLine{
		{"marcusb", "Shot a roll at the coast — want to see the scans before I post?", 50, false},
		{"emmal", "Always. The second one from the pier, please.", 48, false},
		{"marcusb", "That is the one I was unsure about, so it is probably the best one.", 46, true},
	}},
	{Lines: []showcaseLine{
		{"priyanair", "The query you shipped is four times faster. Nice work.", 20, false},
		{"liamoc", "All credit to the index. It was doing nothing for years.", 19, false},
		{"priyanair", "Indexes are the quiet heroes of this codebase.", 18, false},
	}},
	{Lines: []showcaseLine{
		{"zarah", "Which map app do you actually trust in the mountains?", 60, false},
		{"omarf", "The paper one I draw for you 😄 But offline tiles, otherwise.", 58, false},
	}},
	{Lines: []showcaseLine{
		{"sofiar", "That slow-roasted tomato recipe — do you really leave it in for four hours?", 22, false},
		{"diegof", "Four hours at 120°C. Less if the tomatoes are small. It is worth it, I promise.", 21, false},
		{"sofiar", "Testing it tomorrow. I will report back with photographic evidence.", 20, false},
		{"diegof", "That is the only kind of evidence I accept 😄", 19, false},
	}},
	{Lines: []showcaseLine{
		{"noahkim", "Sending you the demo. Tell me if the second verse is too slow.", 40, false},
		{"isabellas", "It is not too slow, it is just building. Trust it.", 38, false},
		{"noahkim", "You are the only person who says that.", 37, false},
		{"isabellas", "Because I am right. Keep it.", 36, true},
	}},
	{Lines: []showcaseLine{
		{"hanas", "The celadon cups are out of the kiln. Want first pick before I list them?", 34, false},
		{"emmal", "Yes please. The wonky one with the thumbprint.", 33, false},
		{"hanas", "That one is yours. It is the best one anyway.", 32, false},
	}},
	{Lines: []showcaseLine{
		{"felixw", "Sent you the site photos from this morning. The oak is framing everything.", 44, false},
		{"lucasm", "Saw them. The light under the canopy is unreal. Can I bring a camera next visit?", 43, false},
		{"felixw", "Absolutely. Come Thursday, the scaffold is still up.", 42, false},
	}},
	{Lines: []showcaseLine{
		{"kwamem", "Do you still have the interview transcript from the port story?", 52, false},
		{"ravip", "Somewhere. I will dig it out tonight.", 50, false},
		{"kwamem", "No rush. It is for the follow-up piece.", 49, false},
	}},
	{Lines: []showcaseLine{
		{"zahraar", "Are you free to shoot the cleanup on Sunday? We could use the coverage.", 30, false},
		{"marcusb", "Free and keen. Sunrise light on the water is the best part anyway.", 29, false},
		{"zahraar", "Perfect. Bring the wide lens.", 28, false},
	}},
	{Lines: []showcaseLine{
		{"gracem", "Your rehearsal schedule looks intense. Are you sleeping?", 26, false},
		{"isabellas", "Mostly. The show is in six weeks and I would rather be tired now than sorry later.", 25, false},
		{"gracem", "Fair. Come to a slow class when you need to breathe.", 24, false},
	}},
	{Lines: []showcaseLine{
		{"tomass", "Set piece drills are paying off. The team looks sharp.", 18, false},
		{"ethanw", "Told you. Small details, big results.", 17, false},
	}},
}

var showcaseFollows = [][2]string{
	{"dummyuser", "avachen"}, {"dummyuser", "marcusb"}, {"dummyuser", "sofiar"},
	{"dummyuser", "liamoc"}, {"dummyuser", "zarah"}, {"dummyuser", "noahkim"},
	{"alexdemo", "avachen"}, {"alexdemo", "marcusb"}, {"alexdemo", "diegof"}, {"alexdemo", "emmal"},

	{"avachen", "emmal"}, {"avachen", "priyanair"}, {"avachen", "hanas"}, {"avachen", "isabellas"}, {"avachen", "meilin"},
	{"marcusb", "emmal"}, {"marcusb", "ethanw"}, {"marcusb", "lucasm"}, {"marcusb", "felixw"},
	{"sofiar", "diegof"}, {"sofiar", "jonasb"}, {"sofiar", "emmal"}, {"sofiar", "avachen"},
	{"liamoc", "priyanair"}, {"liamoc", "ravip"}, {"liamoc", "meilin"}, {"liamoc", "avachen"},
	{"zarah", "omarf"}, {"zarah", "ethanw"}, {"zarah", "zahraar"}, {"zarah", "lucasm"},
	{"noahkim", "isabellas"}, {"noahkim", "hanas"}, {"noahkim", "nadiap"},
	{"emmal", "hanas"}, {"emmal", "avachen"}, {"emmal", "amarao"},
	{"diegof", "sofiar"}, {"diegof", "jonasb"}, {"diegof", "avachen"},
	{"priyanair", "liamoc"}, {"priyanair", "meilin"}, {"priyanair", "ravip"},
	{"hanas", "emmal"}, {"hanas", "jonasb"},
	{"isabellas", "nadiap"}, {"isabellas", "noahkim"},
	{"ethanw", "marcusb"}, {"ethanw", "zahraar"}, {"ethanw", "omarf"},
	{"omarf", "zarah"}, {"omarf", "ethanw"},
	{"lucasm", "marcusb"}, {"lucasm", "felixw"},
	{"zahraar", "zarah"}, {"zahraar", "kwamem"},
	{"jonasb", "diegof"}, {"jonasb", "sofiar"},
	{"felixw", "lucasm"}, {"felixw", "kwamem"},
	{"ravip", "liamoc"}, {"ravip", "priyanair"}, {"ravip", "kwamem"},
	{"meilin", "avachen"}, {"meilin", "priyanair"}, {"meilin", "liamoc"},
	{"kwamem", "zahraar"}, {"kwamem", "ravip"}, {"kwamem", "felixw"},
	{"amarao", "emmal"}, {"amarao", "priyanair"},
	{"tomass", "ethanw"}, {"tomass", "lucasm"}, {"tomass", "omarf"},
	{"gracem", "zahraar"}, {"gracem", "isabellas"},
	{"nadiap", "isabellas"}, {"nadiap", "noahkim"},

	{"dummyuser", "diegof"}, {"dummyuser", "emmal"}, {"dummyuser", "priyanair"}, {"dummyuser", "zahraar"},
	{"dummyuser", "gracem"}, {"dummyuser", "kwamem"}, {"dummyuser", "nadiap"}, {"dummyuser", "ravip"},
	{"zahraar", "gracem"}, {"zahraar", "marcusb"}, {"zahraar", "ethanw"}, {"zahraar", "sofiar"},
	{"kwamem", "felixw"}, {"kwamem", "amarao"}, {"kwamem", "marcusb"},
	{"priyanair", "gracem"}, {"priyanair", "hanas"}, {"priyanair", "amarao"},
	{"hanas", "nadiap"}, {"hanas", "isabellas"}, {"hanas", "lucasm"},
	{"meilin", "gracem"}, {"meilin", "zahraar"}, {"meilin", "emmal"},
	{"felixw", "marcusb"}, {"felixw", "tomass"}, {"felixw", "ethanw"},
	{"lucasm", "noahkim"}, {"lucasm", "nadiap"},
	{"emmal", "priyanair"}, {"emmal", "isabellas"},
	{"sofiar", "hanas"}, {"sofiar", "gracem"},
	{"ravip", "meilin"}, {"ravip", "avachen"},
	{"amarao", "zahraar"}, {"amarao", "hanas"},
	{"noahkim", "lucasm"}, {"noahkim", "sofiar"},
	{"jonasb", "avachen"}, {"jonasb", "hanas"},
	{"tomass", "felixw"}, {"tomass", "marcusb"},
	{"isabellas", "gracem"}, {"isabellas", "lucasm"},
	{"diegof", "priyanair"}, {"diegof", "meilin"},
	{"marcusb", "zahraar"}, {"marcusb", "jonasb"},
	{"avachen", "sofiar"}, {"avachen", "zahraar"}, {"avachen", "gracem"},
	{"gracem", "priyanair"}, {"gracem", "sofiar"}, {"gracem", "avachen"},
	{"omarf", "marcusb"}, {"omarf", "felixw"}, {"omarf", "lucasm"},
	{"ethanw", "felixw"}, {"ethanw", "lucasm"}, {"ethanw", "tomass"},
	{"liamoc", "gracem"}, {"liamoc", "zahraar"}, {"liamoc", "kwamem"},
	{"zarah", "sofiar"}, {"zarah", "avachen"}, {"zarah", "marcusb"},
	{"nadiap", "gracem"}, {"nadiap", "lucasm"}, {"nadiap", "hanas"},
}

var showcasePending = [][2]string{
	{"dummyuser", "gracem"},
	{"isabellas", "gracem"},
	{"kwamem", "nadiap"},
	{"alexdemo", "nadiap"},
	{"zahraar", "tomass"},
	{"meilin", "gracem"},
	{"felixw", "tomass"},
}

type showcaseStory struct {
	Author   string
	Text     string
	AgeHours int
	Photo    bool
	Archive  bool
}

var showcaseStories = []showcaseStory{
	{"avachen", "", 1, true, false},
	{"marcusb", "", 2, true, false},
	{"sofiar", "Making pasta from scratch tonight. Wish me luck 🍝", 3, false, false},
	{"diegof", "", 5, true, false},
	{"zarah", "", 6, true, false},
	{"noahkim", "Studio day. The new song finally has an ending. 🎧", 8, false, false},
	{"zahraar", "", 9, true, false},
	{"emmal", "", 2, true, false},
	{"priyanair", "Sunrise run along the river. Legs heavy, head clear. 🏃‍♀️", 4, false, false},
	{"hanas", "", 5, true, false},
	{"isabellas", "Studio mirrors and a playlist we will never admit to. 💃", 7, false, false},
	{"lucasm", "", 10, true, false},
	{"felixw", "Roof pour at the project today. Concrete everywhere, exactly as planned.", 12, false, false},
	{"meilin", "", 14, true, false},
	{"jonasb", "Cupping table is set. Come help me score the new lots. ☕", 16, false, false},
	{"kwamem", "", 18, true, false},
	{"nadiap", "Ninety minutes on the same eight bars. Almost there. 🎹", 20, false, false},
	{"omarf", "", 22, true, false},
	{"tomass", "Match day. Away, windy, and we are ready. ⚽", 24, false, false},
	{"gracem", "Evening flow by candlelight tonight. Slow down with me. 🕯️", 26, false, false},
	{"amarao", "", 28, true, false},
	{"ravip", "Ten thousand users and a very messy desk. Thank you all. 🚀", 30, false, false},
	{"avachen", "Old sketches from last winter, kept for the archive.", 40, true, true},
	{"marcusb", "A roll that did not make the feed. Still love frame six.", 44, true, true},
	{"hanas", "Seconds sale this weekend — the imperfect cups are the interesting ones.", 48, true, true},
}

var showcaseStoryViews = [][2]string{
	{"dummyuser", "avachen"},
	{"dummyuser", "marcusb"},
	{"dummyuser", "sofiar"},
	{"dummyuser", "emmal"},
	{"dummyuser", "priyanair"},
	{"dummyuser", "hanas"},
	{"dummyuser", "zahraar"},
	{"dummyuser", "noahkim"},
	{"alexdemo", "avachen"},
	{"alexdemo", "marcusb"},
	{"alexdemo", "diegof"},
	{"alexdemo", "zahraar"},
	{"ethanw", "marcusb"},
	{"ethanw", "omarf"},
	{"ethanw", "lucasm"},
	{"zarah", "zahraar"},
	{"zarah", "omarf"},
	{"marcusb", "emmal"},
	{"marcusb", "zahraar"},
	{"avachen", "emmal"},
	{"avachen", "sofiar"},
	{"sofiar", "diegof"},
	{"sofiar", "jonasb"},
	{"priyanair", "gracem"},
	{"hanas", "emmal"},
	{"isabellas", "nadiap"},
	{"lucasm", "marcusb"},
	{"meilin", "zahraar"},
	{"kwamem", "zahraar"},
	{"gracem", "isabellas"},
}

type showcaseStoryReply struct {
	Author   string
	Target   string
	Text     string
	AgeHours int
}

var showcaseStoryReplies = []showcaseStoryReply{
	{"marcusb", "avachen", "This colour palette is so calming, love it.", 1},
	{"sofiar", "marcusb", "Frame two is the one.", 2},
	{"avachen", "emmal", "The fox is perfect. Is it for the new book?", 2},
	{"ethanw", "zahraar", "Beautiful water today. What depth was this?", 8},
	{"hanas", "emmal", "Save me a print of this one.", 2},
	{"diegof", "sofiar", "Pasta looks incredible. Recipe please 🍝", 3},
	{"priyanair", "gracem", "This is exactly what I needed before my long run.", 25},
	{"noahkim", "nadiap", "Eight bars that good deserve another ninety minutes.", 19},
	{"gracem", "isabellas", "The energy in this story is unmatched.", 6},
	{"isabellas", "noahkim", "Playing this on repeat while I stretch.", 7},
	{"marcusb", "lucasm", "The grain here is so good. What stock?", 9},
	{"zarah", "omarf", "Where is this? Adding it to the list.", 21},
}

var showcaseGroupInvitations = []struct{ Inviter, Invitee, Group string }{
	{"diegof", "dummyuser", "Home Cooks"},
	{"liamoc", "kwamem", "Dev Circle"},
	{"priyanair", "hanas", "Trail Runners"},
	{"zahraar", "sofiar", "Ocean Guardians"},
	{"noahkim", "emmal", "Music Room"},
}

type showcaseLike struct {
	Handle string
	Post   int
}

// showcaseLikes are explicit, deterministic reactions on top of the ones the
// seeder spreads at random. They guarantee the demo accounts (dummyuser and
// alexdemo) have liked a realistic spread of posts, and that individual posts
// carry a believable mix of likers rather than a uniform random sample.
var showcaseLikes = []showcaseLike{
	{"dummyuser", 0}, {"dummyuser", 2}, {"dummyuser", 3}, {"dummyuser", 4}, {"dummyuser", 6},
	{"dummyuser", 7}, {"dummyuser", 9}, {"dummyuser", 10}, {"dummyuser", 12}, {"dummyuser", 14},
	{"dummyuser", 16}, {"dummyuser", 18}, {"dummyuser", 20}, {"dummyuser", 22}, {"dummyuser", 25},
	{"dummyuser", 28}, {"dummyuser", 30},
	{"alexdemo", 0}, {"alexdemo", 1}, {"alexdemo", 2}, {"alexdemo", 4}, {"alexdemo", 5},
	{"alexdemo", 8}, {"alexdemo", 11}, {"alexdemo", 13}, {"alexdemo", 17}, {"alexdemo", 21},
	{"alexdemo", 26}, {"alexdemo", 31},
	{"zahraar", 12}, {"zahraar", 13}, {"zahraar", 19}, {"zahraar", 24}, {"zahraar", 31},
	{"marcusb", 7}, {"marcusb", 23}, {"marcusb", 27},
	{"avachen", 3}, {"avachen", 16}, {"avachen", 20},
	{"sofiar", 1}, {"sofiar", 25},
	{"diegof", 16}, {"diegof", 25},
	{"priyanair", 4}, {"priyanair", 29},
	{"liamoc", 5}, {"liamoc", 15}, {"liamoc", 30},
	{"hanas", 7}, {"hanas", 23},
	{"isabellas", 6}, {"isabellas", 21},
	{"emmal", 7}, {"emmal", 23},
	{"noahkim", 6}, {"noahkim", 21},
	{"gracem", 27}, {"gracem", 29},
	{"kwamem", 19}, {"kwamem", 20},
	{"felixw", 12}, {"felixw", 17},
	{"lucasm", 2}, {"lucasm", 22},
	{"meilin", 0}, {"meilin", 18}, {"meilin", 31},
	{"omarf", 3}, {"omarf", 16},
	{"ravip", 5}, {"ravip", 30},
	{"tomass", 16}, {"tomass", 26},
	{"jonasb", 1}, {"jonasb", 25},
	{"zarah", 3}, {"zarah", 12},
	{"nadiap", 11}, {"nadiap", 21},
	{"ethanw", 2}, {"ethanw", 10}, {"ethanw", 27},
	{"amarao", 7}, {"amarao", 28},
}
