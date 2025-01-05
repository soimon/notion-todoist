export function checkSecret(req: Request) {
    const secret = req.headers.get("x-secret");
    return secret === process.env.SECRET;
}

export const denyAccess = () => new Response("Access denied", { status: 403 });
