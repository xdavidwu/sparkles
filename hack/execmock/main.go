package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	clientremotecommand "k8s.io/client-go/tools/remotecommand"
	"k8s.io/kubelet/pkg/cri/streaming/remotecommand"
)

const (
	registry        = "ghcr.io/xdavidwu/sparkles/"
	busyboxImage    = registry + "busybox"
	sftpServerImage = registry + "sftp-server"
)

func must(e error) {
	if e != nil {
		panic(e)
	}
}

func must2[T any](v T, e error) T {
	if e != nil {
		panic(e)
	}
	return v
}

// k8s.io/kubernetes/pkg/apis/core/v1.Convert_url_Values_To_v1_PodExecOptions
func parseExecOptions(v url.Values) (*remotecommand.Options, error) {
	vm := map[string][]string(v)
	var stdin, stdout, stderr, tty bool

	for _, i := range []struct {
		key  string
		dest *bool
	}{
		{"stdin", &stdin},
		{"stdout", &stdout},
		{"stderr", &stderr},
		{"tty", &tty},
	} {
		field, ok := vm[i.key]
		if !ok {
			continue
		}

		if err := runtime.Convert_Slice_string_To_bool(&field, i.dest, nil); err != nil {
			return nil, fmt.Errorf("cannot parse %s: %w", i.key, err)
		}
	}

	return &remotecommand.Options{
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
		TTY:    tty,
	}, nil
}

type executor struct {
	containerID string
}

var _ remotecommand.Executor = &executor{}

func (e *executor) ExecInContainer(
	ctx context.Context,
	name string, uid types.UID, container string, cmd []string,
	in io.Reader, out, err io.WriteCloser,
	tty bool,
	resize <-chan clientremotecommand.TerminalSize,
	timeout time.Duration,
) error {
	// TODO resize
	session, execErr := exec(ctx, e.containerID, cmd, in, out, err, tty)
	if execErr != nil {
		slog.Error("failed to exec", "error", execErr)
	} else {
		slog.Info("new exec session", "session", session, "cmd", cmd)
	}
	return execErr
}

func main() {
	ctx := must2(connectPodman(context.Background()))
	busybox := must2(runContainer(ctx, busyboxImage))
	// TODO
	_ = must2(runContainerWithPidNsAttachedTo(ctx, busybox, sftpServerImage))

	execHandlerFor := func(containerID string) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			query := r.URL.Query()
			opts, err := parseExecOptions(query)
			if err != nil {
				// TODO metav1.Status, perhaps publish undash api
				slog.Error("cannot parse exec/attach options", "error", err)
				w.WriteHeader(http.StatusBadGateway)
				return
			}

			remotecommand.ServeExec(
				w, r,
				&executor{busybox},
				"", types.UID(""), "", map[string][]string(query)["command"], // name, uid, container, cmd
				opts, time.Hour, time.Second, // opts, idle, creation
				[]string{}, // protocols, spdy only
			)
		})
	}

	mux := http.NewServeMux()
	mux.Handle("/api/v1/namespaces/{namespace}/pods/{pod}/exec", execHandlerFor(busybox))

	l, err := net.Listen("tcp", "localhost:8002")
	if err != nil {
		slog.Error("cannot listen", "error", err)
		os.Exit(1)
	}
	slog.Info("listening", "addr", l.Addr())

	srv := http.Server{
		Handler: mux,
		BaseContext: func(_ net.Listener) context.Context {
			return ctx
		},
	}
	if err := srv.Serve(l); err != nil {
		slog.Error("cannot serve http", "error", err)
		os.Exit(1)
	}
}
