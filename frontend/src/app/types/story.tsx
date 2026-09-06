import { StaticImageData } from "next/image";

type Story = {
    _id: string;
    user: {
		_id: string;
		profile_picture: string | StaticImageData;
		full_name: string;
    };
    content: string;
	media_url: string;
    media_type: string;
    createdAt: string;
	background_color: string;
};

export default Story;