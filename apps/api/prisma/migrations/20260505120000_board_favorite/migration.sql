-- Doc 36: favoritos de fluxo por usuario.
CREATE TABLE "BoardFavorite" (
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "favoritedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardFavorite_pkey" PRIMARY KEY ("userId","boardId")
);

CREATE INDEX "BoardFavorite_userId_idx" ON "BoardFavorite"("userId");

ALTER TABLE "BoardFavorite" ADD CONSTRAINT "BoardFavorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardFavorite" ADD CONSTRAINT "BoardFavorite_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
