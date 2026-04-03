package providers

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// baseProvider provides shared logging and retry logic for all concrete providers.
// Embed this in provider implementations to inherit these behaviours.
type baseProvider struct {
	logger *slog.Logger
}

func newBase(logger *slog.Logger) baseProvider {
	if logger == nil {
		logger = slog.Default()
	}
	return baseProvider{logger: logger}
}

// retryUntil calls check repeatedly until it returns true, the context is cancelled,
// or the timeout elapses. Returns nil on success.
func (b *baseProvider) retryUntil(
	ctx context.Context,
	check func() (bool, error),
	timeout time.Duration,
	interval time.Duration,
) error {
	deadline := time.Now().Add(timeout)
	for {
		ok, err := check()
		if err == nil && ok {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out after %s", timeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
		}
	}
}
