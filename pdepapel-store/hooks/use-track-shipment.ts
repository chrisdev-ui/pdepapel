import { useMutation } from "@tanstack/react-query";
import {
  TrackShipmentResponse,
  TrackShipmentVariables,
  postTrackShipment,
} from "@/actions/post-track-shipment";

function useTrackShipment({
  onError,
  onSuccess,
  onSettled,
  onMutate,
}: {
  onError?: (
    err: Error,
    variables: TrackShipmentVariables,
    context: unknown,
  ) => void;
  onSuccess?: (
    data: TrackShipmentResponse,
    variables: TrackShipmentVariables,
    context: unknown,
  ) => void;
  onSettled?: (
    data: TrackShipmentResponse | undefined,
    error: Error | null,
    variables: TrackShipmentVariables,
    context: unknown,
  ) => void;
  onMutate?: (variables: TrackShipmentVariables) => void;
} = {}) {
  const mutationFn = postTrackShipment;

  return useMutation({
    mutationFn,
    onError,
    onSuccess,
    onSettled,
    onMutate,
  });
}

export default useTrackShipment;
