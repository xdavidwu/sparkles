package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"

	"github.com/moby/moby/api/types/container"
	"go.podman.io/podman/v6/pkg/api/handlers"
	"go.podman.io/podman/v6/pkg/bindings"
	"go.podman.io/podman/v6/pkg/bindings/containers"
	"go.podman.io/podman/v6/pkg/bindings/images"
	"go.podman.io/podman/v6/pkg/specgen"
	clientremotecommand "k8s.io/client-go/tools/remotecommand"
)

func connectPodman(ctx context.Context) (context.Context, error) {
	return bindings.NewConnection(
		ctx,
		fmt.Sprintf("unix:///run/user/%d/podman/podman.sock", os.Getuid()),
	)
}

func runSpec(ctx context.Context, spec *specgen.SpecGenerator) (string, error) {
	if spec.Image != "" {
		if _, err := images.Pull(ctx, spec.Image, &images.PullOptions{
			Policy: new("missing"),
		}); err != nil {
			return "", fmt.Errorf("cannot pull image: %w", err)
		}
	}

	created, err := containers.CreateWithSpec(ctx, spec, nil)
	if err != nil {
		return "", fmt.Errorf("cannot create container: %w", err)
	}

	if err := containers.Start(ctx, created.ID, nil); err != nil {
		return "", fmt.Errorf("cannot start container: %w", err)
	}

	return created.ID, nil
}

func runContainer(ctx context.Context, image string) (string, error) {
	spec := specgen.NewSpecGenerator(image, false)
	spec.Stdin = new(true)
	return runSpec(ctx, spec)
}

func runContainerWithPidNsAttachedTo(ctx context.Context, id string, image string) (string, error) {
	spec := specgen.NewSpecGenerator(image, false)
	spec.Stdin = new(true)
	spec.PidNS = specgen.Namespace{
		NSMode: specgen.FromContainer,
		Value:  id,
	}
	return runSpec(ctx, spec)
}

func createExec(ctx context.Context, id string, cmd []string, in io.Reader, out, err io.Writer, tty bool) (string, error) {
	return containers.ExecCreate(ctx, id, &handlers.ExecCreateConfig{
		ExecCreateRequest: container.ExecCreateRequest{
			Tty:          tty,
			AttachStdin:  in != nil,
			AttachStderr: err != nil,
			AttachStdout: out != nil,
			Cmd:          cmd,
		},
	})
}

func startExec(ctx context.Context, session string, in io.Reader, out, err io.Writer) error {
	writerPtr := func(w io.Writer) *io.Writer {
		if w == nil {
			return nil
		}
		return &w
	}

	bufferReader := func(r io.Reader) *bufio.Reader {
		if r == nil {
			return nil
		}
		return bufio.NewReader(r)
	}

	return containers.ExecStartAndAttach(ctx, session, &containers.ExecStartAndAttachOptions{
		OutputStream: writerPtr(out),
		ErrorStream:  writerPtr(err),
		InputStream:  bufferReader(in),
		AttachOutput: new(out != nil),
		AttachError:  new(err != nil),
		AttachInput:  new(in != nil),
	})
}

func handleResizes(ctx context.Context, session string, resize <-chan clientremotecommand.TerminalSize) error {
	for sz := range resize {
		if err := containers.ResizeExecTTY(ctx, session, &containers.ResizeExecTTYOptions{
			Height: new(int(sz.Height)),
			Width:  new(int(sz.Width)),
		}); err != nil {
			return err
		}
	}

	return nil
}
