package gear_test

import (
	"bytes"
	"net/http"
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

func TestPhotoUploader_Upload_RejectsUnsupportedContentType(t *testing.T) {
	// We can't spin up MinIO in a unit test, so we test the content-type
	// validation which happens before any network call.
	u, err := gear.NewPhotoUploader("http://localhost:9000", "key", "secret", "bucket")
	if err != nil {
		t.Fatalf("new uploader: %v", err)
	}
	req, _ := http.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("data")))
	req.Header.Set("Content-Type", "application/pdf")
	_, err = u.Upload(req.Context(), "gear-id", "application/pdf", *req)
	if err == nil {
		t.Error("expected error for unsupported content type")
	}
}
