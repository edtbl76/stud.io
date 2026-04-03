package providers

import "context"

// HTTPHealthChecker tests whether an HTTP endpoint is reachable and returns 2xx.
type HTTPHealthChecker interface {
	IsReachable(ctx context.Context, url string) (bool, error)
}
