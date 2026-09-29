const KEY_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{2,119}$/i;

export const parseMatchInput = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入官方比赛 URL 或比赛 KEY");
  }

  let candidate = trimmed;

  try {
    const url = new URL(trimmed);
    const routeMatch = url.hash.match(/\/discipline\/TTE\/results\/([^/?#]+)/i);
    if (!routeMatch) {
      throw new Error("URL 中没有找到 TTE 比赛 KEY");
    }
    candidate = decodeURIComponent(routeMatch[1]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "URL 中没有找到 TTE 比赛 KEY"
    ) {
      throw error;
    }
  }

  if (!KEY_PATTERN.test(candidate)) {
    throw new Error("比赛 KEY 格式无效");
  }

  return candidate;
};
