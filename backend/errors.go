package realtimeforum

import "errors"

var (
	ErrAlreadyFollowing     = errors.New("you already follow this user")
	ErrFollowPending        = errors.New("your follow request is already pending")
	ErrReverseFollowPending = errors.New("accept or decline this user's incoming follow request first")
	ErrBadRequest           = errors.New("bad request")
	ErrUnauthorized         = errors.New("you must log in to do that")
	ErrForbidden            = errors.New("you don't have permission to do that")
	ErrNotFound             = errors.New("not found")
	ErrInternal             = errors.New("something went wrong, please try again")
	ErrGender               = errors.New("gender must be either male or female")
	ErrMethodNotAllowed     = errors.New("method not allowed")
	ErrInvalidPassForm      = errors.New("password must contain at least one letter, one number, and one symbol")
	ErrInvalidCredentials   = errors.New("invalid email or password")
	ErrWrongPassword        = errors.New("your current password is incorrect")
	ErrPasswordsDontMatch   = errors.New("passwords do not match")
	ErrInvalidAge           = errors.New("please enter a valid age between 1 and 100")
	ErrInvalidBirthDate     = errors.New("please enter a valid date of birth; you must be at least 13 years old")
	ErrInvalidEmail         = errors.New("please enter a valid email address")
	ErrEmailExists          = errors.New("this email is already registered")
	ErrNickName             = errors.New("this username is already taken")
	ErrNickNameLength       = errors.New("username must be between 2 and 33 characters")
	ErrPasswordLength       = errors.New("password must be between 12 and 64 characters")
	ErrTitleLength          = errors.New("title must be between 3 and 30 characters")
	ErrContentLength        = errors.New("content must be between 10 and 500 characters")
	ErrCommentLength        = errors.New("comment must be between 3 and 300 characters")
	ErrMissingPostId        = errors.New("post not found")
	ErrNonASCII             = errors.New("only English letters, numbers, and punctuation are allowed")
	ErrTooManyRequests      = errors.New("too many attempts, please wait a moment")
	// Upload limits answer 413, not 400: the request was well formed, it was
	// simply too big to accept. The messages name the limit so the client can
	// show something better than "bad request".
	ErrEmptyUpload    = errors.New("the selected file is empty")
	ErrUploadTooLarge = errors.New("the file is larger than the 50 MB limit")
	ErrImageTooLarge  = errors.New("the image is larger than the 10 MB limit")
	// Reset tokens are single-use and short-lived, and an unusable one answers
	// the same whether it expired, was already spent or never existed: telling
	// those apart tells an attacker which tokens were once real.
	ErrInvalidResetToken = errors.New("this reset link is invalid or has expired")
	// 503 rather than 500: the server is healthy, it just has no way to deliver a
	// link — which in production means no SMTP provider is configured, because a
	// reset link written to a log file is a working credential in a log file.
	ErrResetUnavailable = errors.New("password reset is not available on this server")
)

// ErrDetail carries a measured fact alongside a sentinel — a file's real size, for
// instance — without losing the status the sentinel maps to. HandleError matches
// sentinels with errors.Is, so a wrapped error keeps that status.
//
// Error() is only the detail rather than the sentinel's sentence followed by it, so
// the message a client shows is about this request: "Image is 12.4 MB; the limit is
// 10 MB." reads as an answer, where "the image is larger than the 10 MB limit: Image
// is 12.4 MB" reads as the rule talking to itself. The sentinel is still reachable
// through Unwrap, which is what the status mapping and any future caller use.
type ErrDetail struct {
	sentinel error
	detail   string
}

func (e ErrDetail) Error() string { return e.detail }

func (e ErrDetail) Unwrap() error { return e.sentinel }

// WithDetail wraps a sentinel with the measured fact that explains this refusal.
// The caller is responsible for the fact being true of the request it is answering.
func WithDetail(sentinel error, detail string) error {
	return ErrDetail{sentinel: sentinel, detail: detail}
}
