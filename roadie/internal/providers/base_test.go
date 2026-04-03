package providers

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRetryUntil_SuccessFirstTry(t *testing.T) {
	b := newBase(nil)
	calls := 0
	err := b.retryUntil(context.Background(), func() (bool, error) {
		calls++
		return true, nil
	}, time.Second, 10*time.Millisecond)

	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if calls != 1 {
		t.Errorf("expected 1 call, got %d", calls)
	}
}

func TestRetryUntil_SuccessAfterRetries(t *testing.T) {
	b := newBase(nil)
	calls := 0
	err := b.retryUntil(context.Background(), func() (bool, error) {
		calls++
		return calls >= 3, nil
	}, time.Second, 10*time.Millisecond)

	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if calls < 3 {
		t.Errorf("expected at least 3 calls, got %d", calls)
	}
}

func TestRetryUntil_Timeout(t *testing.T) {
	b := newBase(nil)
	err := b.retryUntil(context.Background(), func() (bool, error) {
		return false, nil
	}, 50*time.Millisecond, 10*time.Millisecond)

	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
}

func TestRetryUntil_ContextCancelled(t *testing.T) {
	b := newBase(nil)
	ctx, cancel := context.WithCancel(context.Background())

	calls := 0
	go func() {
		time.Sleep(30 * time.Millisecond)
		cancel()
	}()

	err := b.retryUntil(ctx, func() (bool, error) {
		calls++
		return false, nil
	}, time.Second, 10*time.Millisecond)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got: %v", err)
	}
}

func TestRetryUntil_CheckError(t *testing.T) {
	b := newBase(nil)
	calls := 0
	checkErr := errors.New("check failed")

	err := b.retryUntil(context.Background(), func() (bool, error) {
		calls++
		if calls < 3 {
			return false, checkErr
		}
		return true, nil
	}, time.Second, 10*time.Millisecond)

	if err != nil {
		t.Fatalf("expected nil error after recovery, got: %v", err)
	}
}
