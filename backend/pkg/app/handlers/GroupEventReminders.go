package handlers

import "time"

// EventReminderLead is how far ahead of an event its reminder goes out: enough
// notice to change plans, short enough that the notification is still about
// something imminent.
const EventReminderLead = time.Hour

// EventReminderResult reports one sweep. The two counts differ when nobody said
// they were going, which is not an error — it only means there was nobody to tell.
type EventReminderResult struct {
	Events  int
	Members int
}

// SendEventReminders notifies the members who are going to each event that starts
// inside the window. It has the same shape as PruneOrphanedMedia: a job the server
// runs on a ticker, and safe to run again.
//
// That safety is made real rather than hoped for: the event is stamped before it
// is announced, and only an unstamped row can be stamped, so a second sweep — or
// a second instance — finds nothing to do instead of sending the reminder twice.
// The trade is deliberate: a crash between the stamp and the last notification
// loses a reminder, which is better than everyone getting it twice.
func (re *HandlerContext) SendEventReminders(now time.Time, window time.Duration) (EventReminderResult, error) {
	var result EventReminderResult
	events, err := re.GroupService.Repo.EventsStartingWithin(now, now.Add(window))
	if err != nil {
		return result, err
	}
	for _, event := range events {
		attendees, err := re.GroupService.Repo.EventAttendees(event.ID)
		if err != nil {
			return result, err
		}
		claimed, err := re.GroupService.Repo.MarkEventReminded(event.ID)
		if err != nil {
			return result, err
		}
		if !claimed {
			continue
		}
		result.Events++
		for _, attendee := range attendees {
			// The author is skipped explicitly rather than left to notifyUser's own
			// guard, so the count says how many people were actually told.
			if attendee == event.AuthorID {
				continue
			}
			// The notification points at the group, like the new-event one, because
			// the group is the id the group routes carry and the event lives on its
			// events tab.
			re.notifyUser(attendee, event.AuthorID, "group_event", event.GroupID)
			result.Members++
		}
	}
	return result, nil
}
