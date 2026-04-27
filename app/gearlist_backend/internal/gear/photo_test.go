package gear_test

import (
	"bytes"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/studiocontrolroom/gearlist_backend/internal/gear"
)

func TestNewPhotoUploader_ReturnsNilWhenUnconfigured(t *testing.T) {
	u, err := gear.NewPhotoUploader("", "", "", "bucket")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if u != nil {
		t.Error("expected nil uploader when endpoint is empty")
	}
}

func TestPhotoUploader_Upload_RejectsOversizedContentLength(t *testing.T) {
	u, err := gear.NewPhotoUploader("http://localhost:9000", "key", "secret", "bucket")
	if err != nil {
		t.Fatalf("new uploader: %v", err)
	}
	req, _ := http.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("data")))
	req.Header.Set("Content-Type", "image/jpeg")
	req.ContentLength = 11 * 1024 * 1024 // 11 MB — over the 10 MB limit

	_, err = u.Upload(req.Context(), "gear-id", "image/jpeg", *req)
	if !errors.Is(err, gear.ErrPhotoTooLarge) {
		t.Errorf("expected ErrPhotoTooLarge, got %v", err)
	}
}

func TestPhotoUploader_Upload_AcceptsKnownSizeWithinLimit(t *testing.T) {
	u, err := gear.NewPhotoUploader("http://localhost:9000", "key", "secret", "bucket")
	if err != nil {
		t.Fatalf("new uploader: %v", err)
	}
	body := strings.NewReader("fake image data")
	req, _ := http.NewRequest(http.MethodPost, "/", body)
	req.Header.Set("Content-Type", "image/jpeg")
	req.ContentLength = int64(body.Len())

	// Upload will fail on network (no MinIO), but must NOT return ErrPhotoTooLarge.
	_, err = u.Upload(req.Context(), "gear-id", "image/jpeg", *req)
	if errors.Is(err, gear.ErrPhotoTooLarge) {
		t.Error("small upload should not be rejected as too large")
	}
}
