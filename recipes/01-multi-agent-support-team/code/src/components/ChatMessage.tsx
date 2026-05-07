interface Props {
  message: { role: "user" | "assistant"; content: string };
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-2xl p-3 rounded-lg whitespace-pre-wrap ${
          isUser ? "bg-blue-600 text-white" : "bg-white border text-gray-900"
        }`}
      >
        {message.content || <span className="text-gray-400">…</span>}
      </div>
    </div>
  );
}
