// The literal content of the showcase seed: who the members are, what they wrote, and the shape of
// the groups and conversations around them. It is kept apart from the code that inserts it so the
// dataset can be read — and edited — as a dataset rather than as a wall of SQL.
//
// Nothing here is random: the handles, names and sentences are fixed so the showcase looks the
// same on every machine, and the small amount of chance the seed does use (who liked what) is
// driven from one fixed RNG in showcase.go.
package main

// showcaseMember is one account the seed creates. `Avatar` and `Cover` decide whether a generated
// picture is attached, so a few profiles are text-only and the feed is not a wall of images.
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

// showcaseMembers are the people behind the seed, deliberately varied in field, city and voice so
// the feed, the discover page and the suggestion rail all have something believable to show.
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
	{"aishar", "Aisha", "Rahman", "Marine biologist. Counting fish and hoping you count them too.", "Malé, Maldives", "female", 1994, true, true, false},
	{"tomass", "Tomás", "Silva", "Football coach. Pre-season optimist, in-season realist.", "Lisbon, Portugal", "male", 1986, true, false, false},
	{"gracem", "Grace", "Miller", "Yoga teacher. Breathe first, post later.", "Austin, USA", "female", 1994, false, true, false},
	{"ravip", "Ravi", "Patel", "Founder. Shipping beats perfect, most days.", "Mumbai, India", "male", 1989, true, true, false},
	{"nadiap", "Nadia", "Petrova", "Pianist. Practising the same bar for the eleventh time.", "Vienna, Austria", "female", 1987, false, true, false},
	{"kwamem", "Kwame", "Mensah", "Documentary journalist. Listening is the job.", "Accra, Ghana", "male", 1990, true, true, true},
}

// showcaseComment is one reply under a post. `Photo` attaches a generated picture, `SVG` attaches a
// small inline vector image instead (the "svg comments" the seed is asked for) — the two are
// separate fields so a comment can be text-only, illustrated, or both.
type showcaseComment struct {
	Author   string
	Text     string
	AgeHours int
	Photo    bool
	SVG      bool
}

// showcasePost is one feed post. An empty `Privacy` means public; `followers` and `selected` are
// the two narrower audiences the app supports. `AgeHours` backdates the post so the feed has a
// believable spread of "2h" and "5d" rather than everything arriving at once.
type showcasePost struct {
	Author   string
	Content  string
	Privacy  string
	Selected []string
	Photos   int
	AgeHours int
	Comments []showcaseComment
}

// showcasePosts is the feed itself: about twenty posts across the membership, each with a handful
// of replies, so a signed-in member scrolling the feed sees a living page rather than two rows.
var showcasePosts = []showcasePost{
	{"avachen", "Shipped a small redesign of our onboarding flow today. The trick was cutting it in half — turns out nobody reads the third slide. #design #ux", "", nil, 2, 3, []showcaseComment{
		{"marcusb", "The cut is always the hardest part. This looks so much calmer.", 2, false, false},
		{"priyanair", "Would love to see the before and after 👀", 2, false, false},
		{"sofiar", "Beautiful use of whitespace ✨", 1, false, false},
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
	}},
	{"zarah", "Three days in the Atlas Mountains with nothing but a daypack and a bad sense of direction. Best wrong turns I have ever taken. #travel #hiking @omarf", "", nil, 2, 12, []showcaseComment{
		{"omarf", "Next time bring the map I drew you 😄", 11, false, false},
		{"priyanair", "Adding this to my list immediately.", 10, false, false},
		{"lucasm", "The light in these is gorgeous.", 9, false, false},
	}},
	{"priyanair", "Spent the morning explaining p-values to a room of very patient product managers. Best line of the day: a small p-value means the data is loud, not that the effect matters. #datascience", "", nil, 0, 24, []showcaseComment{
		{"liamoc", "Saving this for my next standup.", 23, false, false},
		{"meilin", "Framing it as loud versus important — I am stealing that.", 22, false, false},
		{"avachen", "Please run this session again for our team.", 20, false, false},
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
		{"aishar", "The send face in the second photo says it all 😄", 94, false, false},
	}},
	{"isabellas", "Rehearsal for the spring show. Eleven dancers, one tiny stage, and a piece of music that will not let us rest. #dance @nadiap", "", nil, 1, 104, []showcaseComment{
		{"nadiap", "Playing for you all is the highlight of my month.", 103, false, false},
		{"noahkim", "The choreography is unreal.", 102, false, false},
	}},
	{"felixw", "Model for a courtyard house in the hills. Concrete, timber, and one very large tree we refused to cut down. #architecture", "", nil, 2, 120, []showcaseComment{
		{"lucasm", "The light well is doing so much work here.", 118, false, false},
		{"priyanair", "Glad the tree won.", 116, false, false},
	}},
	{"aishar", "Coral survey day. Water was clear, the reef was loud, and we counted more juvenile fish than last season. Small wins matter. #ocean #conservation", "", nil, 1, 132, []showcaseComment{
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
		{"aishar", "Exactly what I needed to read.", 175, false, false},
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
}

// showcaseLine is a single line of group or direct-chat text. `Photo` attaches a generated image,
// which is what the group media tab and the chat media tab read from.
type showcaseLine struct {
	Author   string
	Text     string
	AgeHours int
	Photo    bool
}

// showcaseGroupPost is one post inside a group, with its own reply thread underneath it.
type showcaseGroupPost struct {
	Author   string
	Text     string
	AgeHours int
	Photo    bool
	Comments []showcaseLine
}

// showcaseGroupEvent is a group event with a starting time relative to now and its RSVP split.
type showcaseGroupEvent struct {
	Author        string
	Title         string
	Text          string
	StartsInHours int
	Going         []string
	NotGoing      []string
}

// showcaseGroup is a group with its members, its wall, an event, a chat and any pending join
// request, which is everything the group screens show.
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
		Members:     []string{"zarah", "ethanw", "aishar", "tomass", "lucasm"},
		Posts: []showcaseGroupPost{
			{"omarf", "Route planned for Saturday: a 12km loop with a stream crossing at the halfway point. Bring more water than you think you need. #hiking", 30, true, []showcaseLine{
				{"zarah", "I am in. Do we need proper boots for the crossing?", 29, false},
				{"ethanw", "Yes, and poles if you have them. That descent is slick.", 28, false},
			}},
			{"ethanw", "Trail conditions update: the upper section is muddy but passable. Saw a family of deer at sunrise. #hiking", 54, true, []showcaseLine{
				{"aishar", "Jealous. I am stuck at a desk today.", 52, false},
			}},
		},
		Events: []showcaseGroupEvent{
			{"omarf", "Saturday ridge loop", "Meet at the car park at 7am. Coffee after, mandatory.", 34, []string{"omarf", "zarah", "ethanw"}, []string{"aishar"}},
		},
		Messages: []showcaseLine{
			{"omarf", "Everyone good for Saturday? Weather looks perfect.", 26, false},
			{"zarah", "Good for me. Bringing snacks.", 25, false},
			{"ethanw", "Count me in.", 24, true},
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
		},
		Requests: []string{"isabellas"},
	},
}

// showcaseDM is one direct conversation. `Author` on each line decides who is speaking, and the
// lines are ordered oldest to newest, which is the reverse of the order the chat reads them back.
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
}

// showcaseFollows is the follow graph the seed always writes, chosen so the feed's suggestion rail
// has something real to rank. The first block mirrors who `dummyuser` and `alexdemo` follow; the
// rest gives several *unfollowed* members followers among those, which is what turns into
// "Followed by X + N more". The seed adds a little more at random on top (see showcase.go).
var showcaseFollows = [][2]string{
	{"dummyuser", "avachen"}, {"dummyuser", "marcusb"}, {"dummyuser", "sofiar"},
	{"dummyuser", "liamoc"}, {"dummyuser", "zarah"}, {"dummyuser", "noahkim"},
	{"alexdemo", "avachen"}, {"alexdemo", "marcusb"}, {"alexdemo", "diegof"}, {"alexdemo", "emmal"},

	{"avachen", "emmal"}, {"avachen", "priyanair"}, {"avachen", "hanas"}, {"avachen", "isabellas"}, {"avachen", "meilin"},
	{"marcusb", "emmal"}, {"marcusb", "ethanw"}, {"marcusb", "lucasm"}, {"marcusb", "felixw"},
	{"sofiar", "diegof"}, {"sofiar", "jonasb"}, {"sofiar", "emmal"}, {"sofiar", "avachen"},
	{"liamoc", "priyanair"}, {"liamoc", "ravip"}, {"liamoc", "meilin"}, {"liamoc", "avachen"},
	{"zarah", "omarf"}, {"zarah", "ethanw"}, {"zarah", "aishar"}, {"zarah", "lucasm"},
	{"noahkim", "isabellas"}, {"noahkim", "hanas"}, {"noahkim", "nadiap"},
	{"emmal", "hanas"}, {"emmal", "avachen"}, {"emmal", "amarao"},
	{"diegof", "sofiar"}, {"diegof", "jonasb"}, {"diegof", "avachen"},
	{"priyanair", "liamoc"}, {"priyanair", "meilin"}, {"priyanair", "ravip"},
	{"hanas", "emmal"}, {"hanas", "jonasb"},
	{"isabellas", "nadiap"}, {"isabellas", "noahkim"},
	{"ethanw", "marcusb"}, {"ethanw", "aishar"}, {"ethanw", "omarf"},
	{"omarf", "zarah"}, {"omarf", "ethanw"},
	{"lucasm", "marcusb"}, {"lucasm", "felixw"},
	{"aishar", "zarah"}, {"aishar", "kwamem"},
	{"jonasb", "diegof"}, {"jonasb", "sofiar"},
	{"felixw", "lucasm"}, {"felixw", "kwamem"},
	{"ravip", "liamoc"}, {"ravip", "priyanair"}, {"ravip", "kwamem"},
	{"meilin", "avachen"}, {"meilin", "priyanair"}, {"meilin", "liamoc"},
	{"kwamem", "aishar"}, {"kwamem", "ravip"}, {"kwamem", "felixw"},
	{"amarao", "emmal"}, {"amarao", "priyanair"},
	{"tomass", "ethanw"}, {"tomass", "lucasm"}, {"tomass", "omarf"},
	{"gracem", "aishar"}, {"gracem", "isabellas"},
	{"nadiap", "isabellas"}, {"nadiap", "noahkim"},
}

// showcasePending are the follow requests that stay pending, because the target is a private
// profile. They are what puts a "Requested" button on a profile and a request in the owner's list.
var showcasePending = [][2]string{
	{"dummyuser", "gracem"},
	{"isabellas", "gracem"},
	{"kwamem", "nadiap"},
	{"alexdemo", "nadiap"},
}

// showcaseStory is one story. A text story carries `Text` and no photo; an image story the
// opposite. `Archive` places it already expired, so a member's archive is never empty.
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
	{"aishar", "", 9, true, false},
	{"avachen", "Old sketches from last winter, kept for the archive.", 40, true, true},
	{"marcusb", "A roll that did not make the feed. Still love frame six.", 44, true, true},
}

// showcaseStoryViews records who opened whose stories, so the stories strip shows what is new to
// the viewer rather than the same ring for everyone.
var showcaseStoryViews = [][2]string{
	{"dummyuser", "avachen"},
	{"dummyuser", "marcusb"},
	{"dummyuser", "sofiar"},
	{"alexdemo", "avachen"},
	{"ethanw", "marcusb"},
	{"zarah", "aishar"},
}

// showcaseStoryReply is a reply left on someone's story, read back by the story's author alone.
type showcaseStoryReply struct {
	Author   string
	Target   string
	Text     string
	AgeHours int
}

var showcaseStoryReplies = []showcaseStoryReply{
	{"marcusb", "avachen", "This colour palette is so calming, love it.", 1},
	{"sofiar", "marcusb", "Frame two is the one.", 2},
}

// showcaseGroupInvitations are the pending group invitations a couple of members carry, so the
// invitations surface is not empty.
var showcaseGroupInvitations = []struct{ Inviter, Invitee, Group string }{
	{"diegof", "dummyuser", "Home Cooks"},
}
