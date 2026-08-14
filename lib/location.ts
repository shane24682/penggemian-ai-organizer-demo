export type Coordinate = { lat: number; lng: number; label: string };

export type Venue = {
  id: string;
  name: string;
  categories: string[];
  coordinate: Coordinate;
  pricePerHour: number;
  openHours: string;
  rating: number;
  reviewCount: number;
  recentReview: string;
  address: string;
};

export const campusLocations: Coordinate[] = [
  {label:"杭州大学城 · 高教西区", lat:30.3156, lng:120.3503},
  {label:"杭州大学城 · 高教东区", lat:30.3069, lng:120.3694},
  {label:"下沙地铁站", lat:30.3098, lng:120.3215},
  {label:"金沙湖地铁站", lat:30.2997, lng:120.3250},
];

export const venueCatalog: Venue[] = [
  {id:"v1",name:"东区青年体育馆",categories:["运动"],coordinate:{label:"高教东区",lat:30.3092,lng:120.3658},pricePerHour:72,openHours:"07:00–22:30",rating:4.8,reviewCount:186,recentReview:"场地干净，晚上灯光充足，前台可借球拍。",address:"学源街东区生活园北侧"},
  {id:"v2",name:"金沙运动中心",categories:["运动","户外探索"],coordinate:{label:"金沙湖",lat:30.3024,lng:120.3341},pricePerHour:58,openHours:"09:00–23:00",rating:4.6,reviewCount:241,recentReview:"价格友好，周末热门时段需要提前预约。",address:"金沙大道 268 号"},
  {id:"v3",name:"南门青年桌游馆",categories:["轻娱乐","社团社交"],coordinate:{label:"高教西区",lat:30.3121,lng:120.3467},pricePerHour:48,openHours:"12:00–次日 01:00",rating:4.9,reviewCount:329,recentReview:"店员会教规则，包间隔音不错，学生套餐划算。",address:"文泽路南门商业街 2F"},
  {id:"v4",name:"拾光影像共创空间",categories:["兴趣技能","社团社交"],coordinate:{label:"高教东区",lat:30.3143,lng:120.3602},pricePerHour:36,openHours:"10:00–21:30",rating:4.7,reviewCount:94,recentReview:"自然光充足，有基础灯具，适合零基础约拍。",address:"学林街创意园 3 号楼"},
  {id:"v5",name:"湖畔青年活动中心",categories:["学习充电","兴趣技能","社团社交"],coordinate:{label:"金沙湖",lat:30.2968,lng:120.3296},pricePerHour:30,openHours:"08:30–22:00",rating:4.5,reviewCount:117,recentReview:"桌椅灵活，投影稳定，读书会和工作坊都合适。",address:"金沙湖公园东门"},
  {id:"v6",name:"钱塘户外集合点",categories:["户外探索","运动"],coordinate:{label:"江滨",lat:30.2907,lng:120.3744},pricePerHour:0,openHours:"全天开放",rating:4.6,reviewCount:76,recentReview:"路线视野好，建议傍晚集合并做好防蚊。",address:"之江东路江滨绿道入口"},
];

export function haversineKm(a: Pick<Coordinate,"lat"|"lng">, b: Pick<Coordinate,"lat"|"lng">) {
  const radius = 6371;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function geographicCenter(points: Array<Pick<Coordinate,"lat"|"lng">>): Coordinate {
  const valid = points.length ? points : [campusLocations[0]];
  return {
    label:"匹配成员地理中心",
    lat:valid.reduce((sum, point) => sum + point.lat, 0) / valid.length,
    lng:valid.reduce((sum, point) => sum + point.lng, 0) / valid.length,
  };
}

export function recommendVenues(category: string, participants: Array<Pick<Coordinate,"lat"|"lng">>, seats: number) {
  const center = geographicCenter(participants);
  return venueCatalog.map(venue => {
    const distanceKm = haversineKm(center, venue.coordinate);
    const categoryFit = venue.categories.includes(category) ? 36 : 5;
    const distanceScore = Math.max(0, 34 - distanceKm * 8);
    const ratingScore = venue.rating * 5;
    const priceScore = Math.max(0, 18 - venue.pricePerHour / 6);
    const totalScore = Math.round(categoryFit + distanceScore + ratingScore + priceScore);
    return {
      ...venue,
      distanceKm,
      perPerson: Math.ceil(venue.pricePerHour * 2 / Math.max(1, seats)),
      totalScore,
    };
  }).sort((a,b)=>b.totalScore-a.totalScore).slice(0,3);
}

