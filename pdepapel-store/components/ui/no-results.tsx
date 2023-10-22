interface NoResultsProps {
  message: string;
}

export const NoResults: React.FC<NoResultsProps> = ({ message }) => {
  return (
    <div className="flex h-full w-full items-center justify-center text-neutral-500">
      {message}
    </div>
  );
};
