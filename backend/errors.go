package realtimeforum

import "errors"

var (
	ErrBadRequest         = errors.New("bad request")
	ErrUnauthorized       = errors.New("you must log in to do that")
	ErrForbidden          = errors.New("you don't have permission to do that")
	ErrNotFound           = errors.New("not found")
	ErrInternal           = errors.New("something went wrong, please try again")
	ErrGender             = errors.New("gender must be either male or female")
	ErrMethodNotAllowed   = errors.New("method not allowed")
	ErrInvalidPassForm    = errors.New("password must contain at least one letter, one number, and one symbol")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrPasswordsDontMatch = errors.New("passwords do not match")
	ErrInvalidAge         = errors.New("please enter a valid age between 1 and 100")
	ErrInvalidEmail       = errors.New("please enter a valid email address")
	ErrEmailExists        = errors.New("this email is already registered")
	ErrNickName           = errors.New("this username is already taken")
	ErrNickNameLength     = errors.New("username must be between 2 and 33 characters")
	ErrPasswordLength     = errors.New("password must be between 12 and 64 characters")
	ErrTitleLength        = errors.New("title must be between 3 and 30 characters")
	ErrContentLength      = errors.New("content must be between 10 and 500 characters")
	ErrCommentLength      = errors.New("comment must be between 3 and 300 characters")
	ErrNoCategorySelected = errors.New("please select a category for your post")
	ErrMissingPostId      = errors.New("post not found")
	ErrNonASCII           = errors.New("only English letters, numbers, and punctuation are allowed")
)
