package gear

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var allowedContentTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// Uploader uploads gear photos to MinIO object storage.
type Uploader struct {
	client *minio.Client
	bucket string
}

// NewPhotoUploader creates an Uploader. Returns nil (no error) when endpoint
// is empty so callers can treat a nil Uploader as "photo upload disabled".
// Endpoint may include a scheme (http://host:port) or be bare (host:port).
func NewPhotoUploader(endpoint, accessKey, secretKey, bucket string) (*Uploader, error) {
	if endpoint == "" {
		return nil, nil
	}
	host, secure, err := parseEndpoint(endpoint)
	if err != nil {
		return nil, fmt.Errorf("minio endpoint: %w", err)
	}
	client, err := minio.New(host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}
	return &Uploader{client: client, bucket: bucket}, nil
}

// parseEndpoint extracts the host:port and secure flag from an endpoint string.
// Accepts both bare "host:port" and URL forms "http(s)://host:port".
func parseEndpoint(endpoint string) (host string, secure bool, err error) {
	if u, parseErr := url.Parse(endpoint); parseErr == nil && u.Host != "" {
		return u.Host, u.Scheme == "https", nil
	}
	return endpoint, false, nil
}

// Upload stores the photo from r and returns the object key.
func (u *Uploader) Upload(ctx context.Context, gearID, contentType string, r http.Request) (string, error) {
	ext, ok := allowedContentTypes[contentType]
	if !ok {
		return "", fmt.Errorf("unsupported content type %q; allowed: image/jpeg, image/png, image/webp", contentType)
	}
	key := path.Join("gear", gearID, "photo"+ext)
	_, err := u.client.PutObject(ctx, u.bucket, key, r.Body, r.ContentLength,
		minio.PutObjectOptions{ContentType: contentType},
	)
	if err != nil {
		return "", fmt.Errorf("upload to MinIO: %w", err)
	}
	return key, nil
}
