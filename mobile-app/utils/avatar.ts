export const getAvatarHash = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; 
    }
    return Math.abs(hash).toString(16);
};

export const getRobohashUrl = (seed: string, offset: number = 0) => {
    return `https://robohash.org/${getAvatarHash(seed + offset)}.png?set=set1&bgset=bg2`;
};
