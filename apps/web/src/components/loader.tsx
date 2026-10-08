import { Spinner } from "@repo/ui/components/ui/spinner";

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-xl">
      <Spinner />
    </div>
  );
}
