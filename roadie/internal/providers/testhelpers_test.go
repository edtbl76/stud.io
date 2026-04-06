package providers

import (
	"context"
	"io"
)

// fakeRunner is a cmdRunner that records invocations and returns canned responses.
type fakeRunner struct {
	runFn          func(ctx context.Context, out io.Writer, name string, args ...string) error
	outputFn       func(ctx context.Context, name string, args ...string) ([]byte, error)
	runWithStdinFn func(ctx context.Context, streams IOStreams, name string, args ...string) error
}

func (f *fakeRunner) Run(ctx context.Context, out io.Writer, name string, args ...string) error {
	if f.runFn != nil {
		return f.runFn(ctx, out, name, args...)
	}
	return nil
}

func (f *fakeRunner) Output(ctx context.Context, name string, args ...string) ([]byte, error) {
	if f.outputFn != nil {
		return f.outputFn(ctx, name, args...)
	}
	return nil, nil
}

func (f *fakeRunner) RunWithStdin(ctx context.Context, streams IOStreams, name string, args ...string) error {
	if f.runWithStdinFn != nil {
		return f.runWithStdinFn(ctx, streams, name, args...)
	}
	return nil
}
