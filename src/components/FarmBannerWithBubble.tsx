export const FarmBannerWithBubble = () => {
  return (
    <div className="w-full h-32 bg-background border-b border-border overflow-hidden">
      <svg 
        width="100%" 
        height="100%" 
        viewBox="0 0 1200 200" 
        className="w-full h-full"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Background hills */}
        <path 
          d="M0 120 Q200 100 400 110 T800 105 Q1000 100 1200 115 L1200 200 L0 200 Z" 
          fill="none" 
          stroke="hsl(var(--primary))" 
          strokeWidth="1.5"
          opacity="0.6"
        />
        <path 
          d="M0 140 Q300 125 600 135 T1200 140 L1200 200 L0 200 Z" 
          fill="none" 
          stroke="hsl(var(--primary))" 
          strokeWidth="1.5"
          opacity="0.4"
        />
        
        {/* Sun */}
        <circle 
          cx="100" 
          cy="50" 
          r="20" 
          fill="none" 
          stroke="hsl(var(--primary))" 
          strokeWidth="2"
        />
        {/* Sun rays */}
        <g stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round">
          <line x1="100" y1="15" x2="100" y2="25" />
          <line x1="135" y1="50" x2="125" y2="50" />
          <line x1="100" y1="85" x2="100" y2="75" />
          <line x1="65" y1="50" x2="75" y2="50" />
          <line x1="125" y1="25" x2="118" y2="32" />
          <line x1="118" y1="68" x2="125" y2="75" />
          <line x1="75" y1="75" x2="82" y2="68" />
          <line x1="82" y1="32" x2="75" y2="25" />
        </g>
        
        {/* Red Barn */}
        <g stroke="hsl(var(--primary))" strokeWidth="2" fill="none">
          {/* Barn main structure */}
          <rect x="200" y="85" width="80" height="55" />
          {/* Barn roof - peaked */}
          <path d="M190 85 L240 55 L290 85 Z" />
          {/* Barn door - classic X pattern */}
          <rect x="220" y="110" width="20" height="30" />
          <line x1="220" y1="110" x2="240" y2="140" strokeWidth="1" />
          <line x1="240" y1="110" x2="220" y2="140" strokeWidth="1" />
          {/* Barn windows */}
          <rect x="210" y="95" width="8" height="8" />
          <rect x="262" y="95" width="8" height="8" />
          {/* Silo */}
          <rect x="290" y="70" width="20" height="70" />
          <ellipse cx="300" cy="70" rx="10" ry="4" />
        </g>
        
        {/* Tree */}
        <g stroke="hsl(var(--primary))" strokeWidth="2" fill="none">
          {/* Tree trunk */}
          <line x1="950" y1="140" x2="950" y2="110" />
          {/* Tree foliage - organic shape */}
          <path d="M925 85 Q935 70 950 75 Q965 70 975 85 Q970 100 950 95 Q930 100 925 85 Z" />
        </g>
        
        {/* Cow */}
        <g stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none">
          {/* Cow body */}
          <ellipse cx="500" cy="120" rx="35" ry="20" />
          {/* Cow head */}
          <ellipse cx="465" cy="115" rx="15" ry="12" />
          {/* Cow legs */}
          <line x1="480" y1="140" x2="480" y2="155" />
          <line x1="495" y1="140" x2="495" y2="155" />
          <line x1="505" y1="140" x2="505" y2="155" />
          <line x1="520" y1="140" x2="520" y2="155" />
          {/* Cow horns */}
          <line x1="460" y1="105" x2="455" y2="100" />
          <line x1="465" y1="105" x2="470" y2="100" />
          {/* Cow tail */}
          <path d="M535 120 Q545 115 540 130" />
        </g>
        
        {/* Sheep */}
        <g stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none">
          {/* Sheep body - fluffy cloud shape */}
          <path d="M700 125 Q695 115 705 115 Q715 110 725 115 Q735 115 730 125 Q735 135 725 135 Q715 140 705 135 Q695 135 700 125 Z" />
          {/* Sheep head */}
          <circle cx="690" cy="120" r="8" />
          {/* Sheep legs */}
          <line x1="705" y1="135" x2="705" y2="150" />
          <line x1="715" y1="135" x2="715" y2="150" />
          <line x1="720" y1="135" x2="720" y2="150" />
          <line x1="710" y1="135" x2="710" y2="150" />
        </g>
        
        {/* BAAA! Speech bubble (cloud-like) above sheep */}
        <g stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none">
          {/* Main cloud bubble */}
          <path d="M750 70 Q745 60 755 60 Q765 55 775 60 Q785 55 795 60 Q805 60 800 70 Q805 80 795 80 Q785 85 775 80 Q765 85 755 80 Q745 80 750 70 Z" />
          {/* Small cloud puffs for detail */}
          <circle cx="770" cy="65" r="8" opacity="0.7" />
          <circle cx="785" cy="68" r="6" opacity="0.5" />
          {/* Speech bubble pointer to sheep */}
          <path d="M750 78 Q745 85 740 90 Q738 92 742 88 Q748 82 752 80" />
          
          {/* BAAA! text */}
          <text 
            x="775" 
            y="72" 
            textAnchor="middle" 
            fontSize="12" 
            fontFamily="monospace" 
            fontWeight="bold"
            fill="hsl(var(--primary))"
            className="select-none"
          >
            BAAA!
          </text>
        </g>
        
        {/* Fence */}
        <g stroke="hsl(var(--primary))" strokeWidth="1.5">
          {/* Fence posts */}
          <line x1="350" y1="130" x2="350" y2="160" />
          <line x1="400" y1="125" x2="400" y2="155" />
          <line x1="600" y1="135" x2="600" y2="165" />
          <line x1="650" y1="130" x2="650" y2="160" />
          {/* Fence rails */}
          <line x1="350" y1="140" x2="400" y2="135" />
          <line x1="350" y1="150" x2="400" y2="145" />
          <line x1="600" y1="145" x2="650" y2="140" />
          <line x1="600" y1="155" x2="650" y2="150" />
        </g>
      </svg>
    </div>
  );
};