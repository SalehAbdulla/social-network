package handlers

import "time"

const EventReminderLead = time.Hour

type EventReminderResult struct {
	Events  int
	Members int
}

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
			if attendee == event.AuthorID {
				continue
			}
			re.notifyUser(attendee, event.AuthorID, "group_event", event.GroupID)
			result.Members++
		}
	}
	return result, nil
}
