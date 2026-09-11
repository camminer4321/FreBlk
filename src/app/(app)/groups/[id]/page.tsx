import GroupClient from "./GroupClient";
import { auth } from "@/auth";
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const s = await auth(); return <GroupClient id={id} meId={s!.user.id} />; }
