interface ViewerState {
  profile_id: string;
  display_name: string;
}

export default function PresencePanel({
  viewers,
  selfId,
}: {
  viewers: ViewerState[];
  selfId: string | null;
}) {
  if (viewers.length === 0) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">Viewing:</span>
      <ul className="flex gap-2">
        {viewers.map((v) => (
          <li
            key={v.profile_id}
            className={
              "px-2 py-0.5 rounded-full text-xs " +
              (v.profile_id === selfId
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-700")
            }
          >
            {v.display_name}
          </li>
        ))}
      </ul>
    </div>
  );
}
